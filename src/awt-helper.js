"use strict";
var BADGE_DEFAULT_BG_COLOR = '#ff0000'
var DAILY_DEALS_URL = 'http://www.amazon.com/gp/feature.html?docId=1000677541&pldnSite=1'
var WISHLISTS_HOME_URL = 'http://smile.amazon.com/gp/registry/wishlist'
var ANALYZE_WISHLIST_ALARM_NAME='fetch-analyze-wishlists'
var ANALYZE_DAILY_DEAL_ALARM_NAME='fetch-analyze-dailydeals'
var CHROME_XTN_URL_PREFIX = 'chrome-extension://' + chrome.runtime.id
var WISHLIST_PAGINATION_SIZE = 25
var PRICE_BUY_THRESHOLD = 2.1
var PRICE_BUY_PROMISING_THRESHOLD = 4.51
var PRICE_DROP_PERCENT_THRESHOLD = 49
var PRICE_DROP_PERCENT_PROMISING_THRESHOLD = 29



chrome.browserAction.onClicked.addListener(function() {
  updateBadgeText('')
  chrome.tabs.query({url : WISHLISTS_HOME_URL + '/*'}, function(tabs) {
    $.each(tabs, function(index, tab) {
      chrome.tabs.remove(tab.id)
    })

    chrome.tabs.create({url : WISHLISTS_HOME_URL})
  })
})

chrome.runtime.onInstalled.addListener(function(details) {
  updateBadgeText('', BADGE_DEFAULT_BG_COLOR)
  chrome.storage.sync.set({'items' : {}})

  chrome.alarms.create(ANALYZE_WISHLIST_ALARM_NAME, {
    when: Date.now() + 500,
    periodInMinutes: 240
  })

  chrome.alarms.create(ANALYZE_DAILY_DEAL_ALARM_NAME, {
    when: Date.now() + 500,
    periodInMinutes: 0.5
  })
})

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name == ANALYZE_WISHLIST_ALARM_NAME) {
    alert('fetchAndAnalyzeWishLists()')
  } else if (alarm.name == ANALYZE_DAILY_DEAL_ALARM_NAME) {
    fetchAndAnalyzeDailyDeals()
  }
})

function fetchAndAnalyzeDailyDeals() {
  $.get(DAILY_DEALS_URL)
  .done(function(response) {
  })
  .fail(function() {
    notify('Uh Oh!', 'Unable to fetch Daily Deals : ' + chrome.runtime.lastError)
  })  
}

function fetchAndAnalyzeWishLists() {
  var now = new Date()
  chrome.browserAction.setTitle({'title' : 'Last Checked at ' + now.toLocaleTimeString() + ', on ' + now.toLocaleDateString()})
  updateBadgeText('WAIT', '#ffa62f')

  $.get(WISHLISTS_HOME_URL)
  .done(function(response) {

    var jqResponse = $(response)
    var wishLists = []
    var wishListsTotalSize = 0

    jqResponse.find('div.a-row a[href^=\'/gp/registry/wishlist/\'][title]:not([title^=\'*\'])').each(function() {
      var wishListId = /\/wishlist\/([^\/\?]+)/.exec(this.href)[1]
      var wishListSize = parseInt(jqResponse.find('span#regItemCount_' + wishListId).text().trim())
      wishListsTotalSize += wishListSize

      if (wishListSize > 0) {
        wishLists.push({
          title : this.title,
          href : makeAmazonUrl(this.href),
          size : wishListSize
        })
      }
    })

    if (wishListsTotalSize > 0) {
      analyzeWishLists(wishLists, wishListsTotalSize)
    } else {
      updateBadgeText('')
    }
  })
  .fail(function() {
    notify('Uh Oh!', 'Unable to fetch list of WishLists : ' + chrome.runtime.lastError)
  })
}

function analyzeWishLists(wishLists, wishListsTotalSize) {
  chrome.storage.sync.get(null, function(data) {
    var savedItems = $.extend({}, data.items)
    var allItems = {}
    var itemsWithUpdates = []
    var numItemsToProcess = wishListsTotalSize

    $(wishLists).each(function(index, wishList) {
      var wishListPages = Math.ceil(wishList.size / WISHLIST_PAGINATION_SIZE)

      for (var wishListPageIndex = 1; wishListPageIndex <= wishListPages; wishListPageIndex++) {
        $.get(wishList.href, {'page': wishListPageIndex})
        .done(function(response) {
          $(response).find('div[id^=item_]').each(function() {
            numItemsToProcess--

            var jqThis = $(this)
            var itemId = this.id.split('_')[1]
            var item = {
              price : -1,
              id : itemId
            }
            var savedItem = $.extend({price : 999999}, savedItems[itemId])

            var itemLink = jqThis.find('a[id^=itemName_' + itemId + ']')[0]
            if (!itemLink) {
              notify('Item Link Absent!', jqThis.html())
            }

            item.title = itemLink.title
            item.url = makeAmazonUrl(itemLink.href)
            item.imageUrl = jqThis.find('div[id^=itemImage_' + itemId + '] img')[0].src

            var itemPrice = jqThis.find('div.price-section > span.a-color-price').text().trim()
            if (!itemPrice) {
              addItemToAllItems(allItems, item, numItemsToProcess)
              if (numItemsToProcess === 0) {
                windUp(allItems, itemsWithUpdates)
              }
              return
            }

            var itemAvailable = (itemPrice.toLowerCase() != 'unavailable')
            if (itemAvailable) {
              item.price = parseFloat(itemPrice.substring(1))
              item.initialPrice = item.price
              item.priceDropPercent = 0

              var priceUpdateSection = jqThis.find('div.a-row > span.a-text-bold:contains(\'Price dropped\')')
              if(priceUpdateSection.length == 1) {
                var priceDropText = priceUpdateSection[0].parentNode.innerText
                var priceAndPercentRegexMatch = /(\d+)%[^$]+\$(\d+\.\d{2})/.exec(priceDropText)
                if (priceAndPercentRegexMatch) {
                  item.priceDropPercent = parseInt(priceAndPercentRegexMatch[1])
                  item.initialPrice = parseFloat(priceAndPercentRegexMatch[2])
                }
              }

              if (savedItem.price === -1) {
                item.availableAgain = true
              }

              if (item.availableAgain || item.price < savedItem.price) {
                itemsWithUpdates.push(item)
              }
            } else if (savedItem.price >= 0) {
              item.unavailable = true
              itemsWithUpdates.push(item)
            }

            addItemToAllItems(allItems, item, numItemsToProcess)
            if (numItemsToProcess === 0) {
              windUp(allItems, itemsWithUpdates)
            }
          })
        })
        .fail(function() {
          notify('Uh Oh!', 'Unable to fetch WishList \'' + wishList.title + '\' : ' + chrome.runtime.lastError)
        })
      }
    })
  })
}

function addItemToAllItems(allItems, item, numItemsToProcess) {
  allItems[item.id] = {
    price : item.price
  }

  updateBadgeText(String(numItemsToProcess))
}

function windUp(allItems, itemsWithUpdates) {
  notifyAboutItemsWithUpdates(allItems, itemsWithUpdates)
}

function notifyAboutItemsWithUpdates(allItems, itemsWithUpdates) {
  chrome.storage.sync.set({'items' : allItems}, function() {
    //TODO: Handle errors.
  })

  var badgeText = ''
  var numItemsWithUpdates = itemsWithUpdates.length
  if (numItemsWithUpdates > 0) {
    badgeText = String(numItemsWithUpdates)
    var promisingUpdates = []

    $(itemsWithUpdates).each(function(idx, item) {
      var priceBelowThreshold = (item.price < PRICE_BUY_THRESHOLD)
      var itemDetails = item.title.substring(0, 27)
      if (itemDetails !== item.title) {
        itemDetails += '...'
      }
      if (item.price > 0) {
        itemDetails += '\n$' + item.price
      }

      var itemDetailsSuffix, subject

      if (item.availableAgain || item.unavailable) {
        notify(item.availableAgain ? 'Back!' : 'Gone!', itemDetails, item.imageUrl, item.url)
      } else if (priceBelowThreshold || item.priceDropPercent > PRICE_DROP_PERCENT_THRESHOLD) {
        if (priceBelowThreshold) {
          itemDetailsSuffix = ' Only!'
          subject = '*** Buy! ***'
        } else {
          itemDetailsSuffix = getFormattedPriceDropNotifyInfo(item)
          subject = 'Sharp Drop!'
        }

        itemDetails += ' ' + itemDetailsSuffix

        notify(subject, itemDetails, item.imageUrl, item.url)
        gMail({
          subject : subject + ' ' + itemDetails,
          message : '<a href=\'' + item.url + '\'><img src=\'' + item.imageUrl + '\' /></a>'
        })
      } else if (item.price < PRICE_BUY_PROMISING_THRESHOLD) {
        promisingUpdates.push(itemDetails)
      } else if (item.priceDropPercent > PRICE_DROP_PERCENT_PROMISING_THRESHOLD) {
        promisingUpdates.push(itemDetails + ' ' + getFormattedPriceDropNotifyInfo(item))
      }
    })

    if (promisingUpdates.length > 0) {
      notify('Promising Updates', promisingUpdates.join('\n------------------------------------------------------------\n'))
    }
  }

  updateBadgeText(badgeText, '#00ff00')
}

function getFormattedPriceDropNotifyInfo(item) {
  return '(↓' + item.priceDropPercent + '% from $' + item.initialPrice + ')'
}

function notify(messageTitle, messageText, iconUrl, navigationUrl) {
  var targetUrl = navigationUrl ? navigationUrl : WISHLISTS_HOME_URL

  var notification = new Notify(messageTitle, {
    body : messageText,
    icon : iconUrl ? iconUrl : 'awt_icon.png',
    notifyClick : function() { chrome.tabs.create({url : targetUrl}) }
  })

  notification.show()
}

function gMail(opts) {
  var gMailUrl = 'https://script.google.com/macros/s/AKfycbxDPJL7tD8d0N-lJ4qiP-6MWKhTQsbAzdubNUBSZh8IGBu4_FA/exec'
  var params = $.extend({}, opts, {
    service : 'mailMe',
    subject : '[AWT] ' + opts.subject
  })

  $.get(gMailUrl, params)
  .fail(function(jqXhr, status) {
    notify('Uh Oh!', 'Unable to send GMail!')
  })
}

function makeAmazonUrl(chromeXtnfiedUrl) {
  return 'http://smile.amazon.com' + chromeXtnfiedUrl.replace(CHROME_XTN_URL_PREFIX, '')
}

function updateBadgeBGColor(color) {
  chrome.browserAction.setBadgeBackgroundColor({'color' : color})
}

function updateBadgeText(text, bgColor) {
  if (bgColor) {
    updateBadgeBGColor(bgColor)
  }

  chrome.browserAction.setBadgeText({'text' : text})
}