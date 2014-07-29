"use strict";
var BADGE_DEFAULT_BG_COLOR = '#ff0000';
var DAILY_DEALS_URL = 'http://smile.amazon.com/gp/feature.html?docId=1000677541';
var WISHLISTS_HOME_URL = 'http://smile.amazon.com/gp/registry/wishlist';
var ANALYZE_WISHLIST_ALARM_NAME='fetch-analyze-wishlists';
var ANALYZE_DAILY_DEAL_ALARM_NAME='fetch-analyze-dailydeals';
var CHROME_XTN_URL_PREFIX = 'chrome-extension://' + chrome.runtime.id;
var WISHLIST_PAGINATION_SIZE = 25;
var PRICE_BUY_THRESHOLD = 2.1;
var PRICE_BUY_PROMISING_THRESHOLD = 4.51;
var PRICE_DROP_PERCENT_THRESHOLD = 49;
var PRICE_DROP_PERCENT_PROMISING_THRESHOLD = 29;

chrome.runtime.onInstalled.addListener(function(details) {
  updateBadgeText('', BADGE_DEFAULT_BG_COLOR);
  chrome.storage.sync.clear();

  chrome.alarms.create(ANALYZE_WISHLIST_ALARM_NAME, {
    when: Date.now() + 500,
    periodInMinutes: 240
  });

  /*chrome.alarms.create(ANALYZE_DAILY_DEAL_ALARM_NAME, {
    when: Date.now() + 500,
    periodInMinutes: 0.5
  });*/
});

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name == ANALYZE_WISHLIST_ALARM_NAME) {
    fetchAndAnalyzeWishLists();
  } else if (alarm.name == ANALYZE_DAILY_DEAL_ALARM_NAME) {
    fetchAndAnalyzeDailyDeals();
  }
});

chrome.runtime.onMessage.addListener(function(request, sender) {
  var requestedOperation = request.operation
  if (requestedOperation === 'checkIfInWishList') {
    var productID = request.productID;
    chrome.storage.sync.get(productID, function(data) {
      if (data[productID]) {
        chrome.tabs.sendMessage(sender.tab.id, {
          operation: 'highlightWishListMembership',
          wishList: data[productID].wl
        });
      }
    });
  } else if (requestedOperation === 'fetchGoodreadsRating') {
    fetchGoodreadsRating(request.productID, request.bookName, sender.tab.id);
  } else if (requestedOperation === 'goToWishlists') {
    updateBadgeText('');
    closeAnyExistingAndOpenNewTab(WISHLISTS_HOME_URL);
  } else if (requestedOperation === 'goToDailyDeals') {
    closeAnyExistingAndOpenNewTab(DAILY_DEALS_URL);
  } else if (requestedOperation === 'fetchAndAnalyzeWishLists') {
    fetchAndAnalyzeWishLists();
  }
});

function fetchAndAnalyzeDailyDeals() {
  $.get(DAILY_DEALS_URL)
  .done(function(response) {
  })
  .fail(function() {
    notify('Uh Oh!', 'Unable to fetch Daily Deals : ' + chrome.runtime.lastError);
  });
}

function fetchAndAnalyzeWishLists() {
  updateBadgeText('WAIT', '#ffa62f');

  $.get(WISHLISTS_HOME_URL)
  .done(function(response) {
    var jqResponse = $(response);
    var wishLists = [];
    var wishListsTotalSize = 0;

    jqResponse.find('div.a-row a[href^=\'/gp/registry/wishlist/\'][title]:not([title^=\'*\'])').each(function() {
      var wishListId = /\/wishlist\/([^\/\?]+)/.exec(this.href)[1];
      var wishListSize = parseInt(jqResponse.find('span#regItemCount_' + wishListId).text().trim());
      wishListsTotalSize += wishListSize;

      if (wishListSize > 0) {
        wishLists.push({
          title : this.title,
          href : makeAmazonUrl(this.href),
          size : wishListSize
        });
      }
    });

    if (wishListsTotalSize > 0) {
      analyzeWishLists(wishLists, wishListsTotalSize);
    } else {
      updateBadgeText('');
    }
  })
  .fail(function() {
    notify('Uh Oh!', 'Unable to fetch list of WishLists : ' + chrome.runtime.lastError);
    updateBadgeText('ERROR');
  });
}

function analyzeWishLists(wishLists, wishListsTotalSize) {
  chrome.storage.sync.get(null, function(data) {
    var savedItems = $.extend({}, data);
    var allItems = {};
    var itemsWithUpdates = [];
    var numItemsToProcess = wishListsTotalSize;

    $(wishLists).each(function(index, wishList) {
      var wishListPages = Math.ceil(wishList.size / WISHLIST_PAGINATION_SIZE);

      for (var wishListPageIndex = 1; wishListPageIndex <= wishListPages; wishListPageIndex++) {
        $.get(wishList.href, {'page': wishListPageIndex})
        .done(function(response) {
          var jqResponse = $(response);
          var wishListName = jqResponse.find('#profile-list-name').html()
          jqResponse.find('div[id^=item_]').each(function() {
            numItemsToProcess--;

            var itemWishListID = this.id.split('_')[1];
            var jqThis = $(this);
            var itemLink = jqThis.find('a[id^=itemName_' + itemWishListID + ']')[0];
            if (!itemLink) {
              notify('Item Link Absent!', jqThis.html());
              return;
            }

            var itemLinkHref = itemLink.href
            var itemASIN = itemLinkHref.match(/\/dp\/([^\/]+)/)[1]
            var item = {
              price: -1,
              id: itemASIN,
              wl: wishListName,
              title: itemLink.title,
              url: makeAmazonUrl(itemLinkHref),
              imageUrl: jqThis.find('div[id^=itemImage_' + itemWishListID + '] img')[0].src
            };

            var savedItem = $.extend({price : 999999}, savedItems[itemASIN]);
            var itemPrice = jqThis.find('div.price-section > span.a-color-price').text().trim();
            if (!itemPrice) {
              addItemToAllItems(allItems, item, numItemsToProcess);
              if (numItemsToProcess === 0) {
                windUp(allItems, itemsWithUpdates);
              }

              return;
            }

            var itemAvailable = (itemPrice.toLowerCase() != 'unavailable');
            if (itemAvailable) {
              item.price = parseFloat(itemPrice.substring(1));
              item.initialPrice = item.price;
              item.priceDropPercent = 0;

              var priceUpdateSection = jqThis.find('div.a-row > span.a-text-bold:contains(\'Price dropped\')');
              if(priceUpdateSection.length == 1) {
                var priceDropText = priceUpdateSection[0].parentNode.innerText;
                var priceAndPercentRegexMatch = /(\d+)%[^$]+\$(\d+\.\d{2})/.exec(priceDropText);
                if (priceAndPercentRegexMatch) {
                  item.priceDropPercent = parseInt(priceAndPercentRegexMatch[1]);
                  item.initialPrice = parseFloat(priceAndPercentRegexMatch[2]);
                }
              }

              if (savedItem.price === -1) {
                item.availableAgain = true;
              }

              if (item.availableAgain || item.price < savedItem.price) {
                itemsWithUpdates.push(item);
              }
            } else if (savedItem.price >= 0) {
              item.unavailable = true;
              itemsWithUpdates.push(item);
            }

            addItemToAllItems(allItems, item, numItemsToProcess);
            if (numItemsToProcess === 0) {
              windUp(allItems, itemsWithUpdates);
            }
          });
        })
        .fail(function() {
          notify('Uh Oh!', 'Unable to fetch WishList \'' + wishList.title + '\' : ' + chrome.runtime.lastError);
        });
      }
    });
  });
}

function addItemToAllItems(allItems, item, numItemsToProcess) {
  allItems[item.id] = {
    price: item.price,
    wl: item.wl
  };

  updateBadgeText(String(numItemsToProcess));
}

function windUp(allItems, itemsWithUpdates) {
  notifyAboutItemsWithUpdates(allItems, itemsWithUpdates);

  chrome.storage.sync.set(allItems, function() {
    if (chrome.runtime.lastError) {
      var errorMessage = chrome.runtime.lastError
      notify('Uh Oh!', 'Unable to store items: ' + errorMessage)
      gMail({
        subject: 'ERROR: Unable to store items',
        message: errorMessage
      })
    } else {
      chrome.storage.sync.getBytesInUse(null, function(usage) {
        var usageInfo = Math.ceil(usage/chrome.storage.sync.QUOTA_BYTES * 100) + '% storage in use.';
        var now = new Date();
        chrome.browserAction.setTitle({
          'title' : 'Last Checked at ' + now.toLocaleTimeString() + ', on ' + now.toLocaleDateString() + '\n' + usageInfo
        });
      });
    }
  });
}

function notifyAboutItemsWithUpdates(allItems, itemsWithUpdates) {
  var badgeText = '';
  var numItemsWithUpdates = itemsWithUpdates.length;
  if (numItemsWithUpdates > 0) {
    badgeText = String(numItemsWithUpdates);
    var promisingUpdates = [];

    $(itemsWithUpdates).each(function(idx, item) {
      var priceBelowThreshold = (item.price < PRICE_BUY_THRESHOLD);
      var itemDetails = item.title.substring(0, 27);
      if (itemDetails !== item.title) {
        itemDetails += '...';
      }
      if (item.price > 0) {
        itemDetails += '\n$' + item.price;
      }

      var itemDetailsSuffix, subject;

      if (item.availableAgain || item.unavailable) {
        notify(item.availableAgain ? 'Back!' : 'Gone!', itemDetails, item.imageUrl, item.url);
      } else if (priceBelowThreshold || item.priceDropPercent > PRICE_DROP_PERCENT_THRESHOLD) {
        if (priceBelowThreshold) {
          itemDetailsSuffix = ' Only!';
          subject = '*** Buy! ***';
        } else {
          itemDetailsSuffix = getFormattedPriceDropNotifyInfo(item);
          subject = 'Sharp Drop!';
        }

        itemDetails += ' ' + itemDetailsSuffix;

        notify(subject, itemDetails, item.imageUrl, item.url);
        gMail({
          subject : subject + ' ' + itemDetails,
          message : '<a href=\'' + item.url + '\'><img src=\'' + item.imageUrl + '\' /></a>'
        });
      } else if (item.price < PRICE_BUY_PROMISING_THRESHOLD) {
        promisingUpdates.push(itemDetails);
      } else if (item.priceDropPercent > PRICE_DROP_PERCENT_PROMISING_THRESHOLD) {
        promisingUpdates.push(itemDetails + ' ' + getFormattedPriceDropNotifyInfo(item));
      }
    });

    if (promisingUpdates.length > 0) {
      notify('Promising Updates', promisingUpdates.join('\n----------------------------------------------\n'));
    }
  }

  updateBadgeText(badgeText, '#00ff00');
}

function getFormattedPriceDropNotifyInfo(item) {
  return '(↓' + item.priceDropPercent + '% from $' + item.initialPrice + ')';
}

function notify(messageTitle, messageText, iconUrl, navigationUrl) {
  var targetUrl = navigationUrl ? navigationUrl : WISHLISTS_HOME_URL;

  var notification = new Notify(messageTitle, {
    body : messageText,
    icon : iconUrl ? iconUrl : 'awt_icon.png',
    notifyClick : function() { chrome.tabs.create({url : targetUrl}) }
  });

  notification.show();
}

function gMail(opts) {
  var gMailUrl = 'https://script.google.com/macros/s/AKfycbxDPJL7tD8d0N-lJ4qiP-6MWKhTQsbAzdubNUBSZh8IGBu4_FA/exec';
  var params = $.extend({}, opts, {
    service : 'mailMe',
    subject : '[AWT] ' + opts.subject
  });

  $.get(gMailUrl, params)
  .fail(function(jqXhr, status) {
    notify('Uh Oh!', 'Unable to send GMail!');
  });
}

function makeAmazonUrl(chromeXtnfiedUrl) {
  return 'http://smile.amazon.com' + chromeXtnfiedUrl.replace(CHROME_XTN_URL_PREFIX, '');
}

function updateBadgeBGColor(color) {
  chrome.browserAction.setBadgeBackgroundColor({'color' : color});
}

function updateBadgeText(text, bgColor) {
  if (bgColor) {
    updateBadgeBGColor(bgColor);
  }

  chrome.browserAction.setBadgeText({'text' : text});
}

function fetchGoodreadsRating(productID, bookName, requesterID) {
  $.ajax({
    url: 'https://www.goodreads.com/search.xml',
    data: {
      key: 'dqVlK3OyDT5HWC0j5HOVtA',
      q: productID
    },
    dataType: 'xml'
  })
  .done(function(xml) {
    var response = {};

    var jqXml = $(xml);
    if (parseInt(jqXml.find('total-results').text()) === 1) {
      response.goodreadsID = jqXml.find('best_book>id').text();
      response.averageRating = jqXml.find('average_rating').text();
      response.ratingsCount = jqXml.find('ratings_count').text();
    } else {
      response.unavailable = true;
    }

    chrome.tabs.sendMessage(requesterID, {
      operation: 'displayGoodreadsRating',
      bookName: bookName,
      productID: productID,
      ratingDetails: response
    });
  })
  .fail(function(jqXHR, textStatus, errorThrown ) {
    chrome.tabs.sendMessage(requesterID, {
      operation: 'displayGoodreadsRating',
      bookName: bookName,
      productID: productID,
      ratingDetails: {
        failed: true
      }
    });
  });
}

function closeAnyExistingAndOpenNewTab(tabUrl) {
  chrome.tabs.query({url: tabUrl + '*'}, function(tabs) {
    $.each(tabs, function(index, tab) {
      chrome.tabs.remove(tab.id);
    });

    chrome.tabs.create({url : tabUrl});
  });
}