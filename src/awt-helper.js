"use strict";
var DEFAULT_PRICE_CHECK_FREQ_MINUTES = 30;
var DEFAULT_BADGE_BG_COLOR = '#ff0000';
var ERROR_ICON = 'error.png';
var BASE_URL = 'http://smile.amazon.com';
var DAILY_DEALS_URL = BASE_URL + '/gp/feature.html?docId=1000677541';
var WISHLISTS_HOME_URL = BASE_URL + '/gp/registry/wishlist';
var ANALYZE_WISHLIST_ALARM_NAME='fetch-analyze-wishlists';
var ANALYZE_DAILY_DEAL_ALARM_NAME='fetch-analyze-dailydeals';
var CHROME_XTN_URL_PREFIX = 'chrome-extension://' + chrome.runtime.id;
var WISHLIST_PAGINATION_SIZE = 25;
var PRICE_BUY_THRESHOLD = 2.1;
var PRICE_BUY_PROMISING_THRESHOLD = 4.51;
var PRICE_DROP_TRIVIALITY_THRESHOLD = 10;
var PRICE_DROP_PERCENT_THRESHOLD = 49;
var PRICE_DROP_PERCENT_PROMISING_THRESHOLD = 29;
var HIGH_PRICED_ITEM_TRIGGER = 70;
var STORAGE_USE_PERCENT_CRITICAL_THRESHOLD = 90;
var STORAGE_USE_PERCENT_WARN_THRESHOLD = 75;

chrome.runtime.onInstalled.addListener(function(details) {
  updateBadgeText('', DEFAULT_BADGE_BG_COLOR);

  chrome.alarms.create(ANALYZE_WISHLIST_ALARM_NAME, {
    when: Date.now() + 500,
    periodInMinutes: DEFAULT_PRICE_CHECK_FREQ_MINUTES
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
  if (requestedOperation === 'manageKeepa') {
    manageKeepa(request.enableExtension);
  } else if (requestedOperation === 'checkIfInWishList') {
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
    fetchGoodreadsRating(request, sender.tab.id);
  } else if (requestedOperation === 'paintGoodreadsRatings') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          operation: 'paintGoodreadsRatings'
        });
      }
    });
  } else if (requestedOperation === 'goToWishlists') {
    updateBadgeText('');
    closeAnyExistingAndOpenNewTab(WISHLISTS_HOME_URL);
  } else if (requestedOperation === 'goToDailyDeals') {
    closeAnyExistingAndOpenNewTab(DAILY_DEALS_URL);
  } else if (requestedOperation === 'fetchAndAnalyzeWishLists') {
    fetchAndAnalyzeWishLists();
  }
});

function manageKeepa(enableExtension) {
  chrome.management.getAll(function(extensionInfos) {
    $(extensionInfos).each(function() {
      if (this.name.match(/keepa/i)) {
        chrome.management.setEnabled(this.id, enableExtension);
      }
    });
  });
}

function fetchAndAnalyzeDailyDeals() {
  $.get(DAILY_DEALS_URL)
  .done(function(response) {
  })
  .fail(function() {
    notifyError(null, 'Unable to fetch Daily Deals : ' + chrome.runtime.lastError, false);
  });
}

function fetchAndAnalyzeWishLists() {
  updateBadgeText('FTCH', '#000000');

  $.get(WISHLISTS_HOME_URL)
  .done(function(response) {
    var jqResponse = $(response);
    var wishLists = {};

    jqResponse.find('a[id^="wl-list-link"]').each(function() {
      var linkText = $(this).find("[id^=wl-list-title]").text().trim()
      if (!linkText.startsWith('*')) {
        wishLists[linkText] = {
          title : linkText,
          href : unfurlChromeXtnfiedURL(this.href),
          size : -1
        };
      }
    });

    var wishListNames = Object.keys(wishLists);
    if (wishListNames.length === 0) {
      notifyError('0WL!', 'No WishLists found!');
    } else {
      updateBadgeText('WLSZ');
      console.log("Discovered WishLists: " + wishListNames.join(", "));
      var wishListsTotalSize = 0;
      $(wishListNames).each(function() {
        $.get(wishLists[this].href)
        .done(function(response) {
          var jqResponse = $(response);
          var wishListName = jqResponse.find("#profile-list-name").text().trim();
          console.log("> Processing WishList: " + wishListName);
          var itemCountElt = jqResponse.find("#viewItemCount");
          var wishListSize = parseInt(
            itemCountElt.val() ||
            itemCountElt.text() ||
            0
          );
          if (wishListSize == 0) {
            console.log("WishList is empty");
            delete wishLists[wishListName];
          } else {
            wishLists[wishListName].size = wishListSize;
            console.log("Found at least " + wishListSize + " item(s) in WishList");
            wishListsTotalSize += wishListSize;
          }

          var unProcessedWishListsPresent = false;

          wishListNames = Object.keys(wishLists);
          $(wishListNames).each(function() {
            var currentWishListSize = wishLists[this].size;
            unProcessedWishListsPresent = (currentWishListSize === -1)
            if (unProcessedWishListsPresent) {
              console.log("Not winding up, because of at least one unprocessed WishList: " + this);
              return false;
            }
          });

          if (!unProcessedWishListsPresent) {
            analyzeWishLists(Object.values(wishLists), wishListsTotalSize);
          }
        });
      });
    }
  })
  .fail(function() {
    notifyError('EWL!', 'Unable to fetch list of WishLists : ' + chrome.runtime.lastError);
  });
}

function analyzeWishLists(wishLists) {
  console.log("WishLists to be analyzed: " + JSON.stringify(wishLists));
  updateBadgeText('ANLZ');
  chrome.storage.sync.get(null, function(data) {
    var savedItems = $.extend({}, data);
    var allItems = {};
    var itemsWithUpdates = [];
    var numWishListsToProcess = wishLists.length;
    updateBadgeText(String(numWishListsToProcess));
    var processedWishListsTrackingInfo = {
      'numWishListsToProcess': numWishListsToProcess
    }

    $(wishLists).each(function(index, wishList) {
      analyzeWishListPage(wishList.href, processedWishListsTrackingInfo, savedItems, allItems, itemsWithUpdates);
    });
  });
}

function analyzeWishListPage(pageURL, processedWishListsTrackingInfo, savedItems, allItems, itemsWithUpdates) {
  $.get(pageURL)
  .done(function(response) {
    var jqResponse = $(response);
    var wishListName = jqResponse.find('#profile-list-name').html()
    jqResponse.find('div[id^=item_]').each(function() {
      var itemWishListID = this.id.split('_')[1];
      var jqThis = $(this);
      var itemLink = jqThis.find('a[id^=itemName_' + itemWishListID + ']')[0];
      if (!itemLink) {
        notifyError(null, 'Unable to find Item Link for "' + itemWishListID + '"!', jqThis.text(), true);
        return;
      }

      var itemLinkHref = itemLink.href
      var itemASIN = itemLinkHref.match(/\/dp\/([^\/]+)/)[1]
      var item = {
        price: -1,
        id: itemASIN,
        wl: wishListName,
        title: itemLink.title,
        url: unfurlChromeXtnfiedURL(itemLinkHref),
        imageUrl: jqThis.find('div[id^=itemImage_' + itemWishListID + '] img')[0].src
      };

      var savedItem = $.extend({price : 999999}, savedItems[itemASIN]);
      var itemPrice = jqThis.find('div.price-section > span.a-color-price').text().trim();
      if (!itemPrice) {
        addItemToAllItems(allItems, item);
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
          itemsWithUpdates.push(item);
        } else if (savedItem.price < 999999) {
          var priceDropDelta = savedItem.price - item.price;
          var isNonTrivialDrop = (priceDropDelta > 0) && (priceDropDelta * 100 / savedItem.price >= PRICE_DROP_TRIVIALITY_THRESHOLD);
          isNonTrivialDrop = isNonTrivialDrop && (item.priceDropPercent > 0) &&
            (!savedItem.priceDropPercent || item.priceDropPercent - savedItem.priceDropPercent > 1);

          if (isNonTrivialDrop) {
            itemsWithUpdates.push(item);
          }
        }
      } else if (savedItem.price >= 0 && savedItem.price < 999999) {
        item.unavailable = true;
      }

      addItemToAllItems(allItems, item);
    });

    var wishListTitleLogText = 'WishList \'' + wishListName + '\'';
    if(jqResponse.find("input[name=lastEvaluatedKey]").val().trim()) {
      console.log('Processing next page of ' + wishListTitleLogText);
      var nextPageURL = unfurlChromeXtnfiedURL(jqResponse.find("input[name=showMoreUrl]").val());
      analyzeWishListPage(nextPageURL, processedWishListsTrackingInfo, savedItems, allItems, itemsWithUpdates);
    } else {
      console.log('Finished processing ' + wishListTitleLogText);
      processedWishListsTrackingInfo['numWishListsToProcess'] = processedWishListsTrackingInfo['numWishListsToProcess'] - 1;
      updateBadgeText(String(processedWishListsTrackingInfo['numWishListsToProcess']));
      if (processedWishListsTrackingInfo['numWishListsToProcess'] === 0) {
        console.log('Finished processing all WishLists. Winding up...');
        windUp(allItems, itemsWithUpdates);
      }
    }
  })
  .fail(function() {
    notifyError(null, 'Unable to fetch page of WishList \'' + wishList.title +
        '\' @ \'' + pageURL + '\' : ' + chrome.runtime.lastError);
  });
}

function addItemToAllItems(allItems, item) {
  allItems[item.id] = {
    price: item.price,
    title: item.title,
    wishList: item.wl
  };
}

function windUp(allItems, itemsWithUpdates) {
  console.log("Items with updates: " + JSON.stringify(itemsWithUpdates));
  try {
    notifyAboutItemsWithUpdates(allItems, itemsWithUpdates);
  } finally {
    chrome.storage.sync.clear(function() {
      if (chrome.runtime.lastError) {
        notify('Warning!', 'Unable to clear old items from storage: "' + chrome.runtime.lastError + '".')
      }

      chrome.storage.sync.set(allItems, function() {
        if (chrome.runtime.lastError) {
          var errorMessage = chrome.runtime.lastError
          notifyError('STOR', 'Unable to store items: ' + errorMessage)
        } else {
          chrome.storage.sync.getBytesInUse(null, function(usage) {
            var bytesInUsePercent = Math.ceil(usage/chrome.storage.sync.QUOTA_BYTES * 100);
            var usageInfo = bytesInUsePercent + '% storage in use.';
            if (bytesInUsePercent >= STORAGE_USE_PERCENT_CRITICAL_THRESHOLD) {
              gMail({
                subject: usageInfo
              });
            } else if (bytesInUsePercent >= STORAGE_USE_PERCENT_WARN_THRESHOLD) {
              notify('Warning!!!', usageInfo);
            }
            var now = new Date();
            chrome.browserAction.setTitle({
              'title' : 'Last Checked at ' + now.toLocaleTimeString() + ', on ' + now.toLocaleDateString() + '\n' + usageInfo
            });
          });
        }
      });
    });
  }
}

function notifyAboutItemsWithUpdates(allItems, itemsWithUpdates) {
  var badgeText = '';
  var numItemsWithUpdates = itemsWithUpdates.length;
  var numItemsToBeNotified = 0;
  if (numItemsWithUpdates > 0) {
    badgeText = String(numItemsWithUpdates);
    var promisingUpdates = [];

    $(itemsWithUpdates).each(function(idx, item) {
      var priceDropPercentPromisingThreshold = PRICE_DROP_PERCENT_PROMISING_THRESHOLD;
      var priceBelowThreshold = (item.price < PRICE_BUY_THRESHOLD);
      var itemDetails = item.title.substring(0, 27);
      if (itemDetails !== item.title) {
        itemDetails += '...';
      }
      if (item.price > 0) {
        itemDetails += '\n$' + item.price;

        if (item.price >= HIGH_PRICED_ITEM_TRIGGER) {
          priceDropPercentPromisingThreshold = 14;
        }
      }

      var itemDetailsSuffix, subject;

      if (priceBelowThreshold || item.priceDropPercent > PRICE_DROP_PERCENT_THRESHOLD) {
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
        numItemsToBeNotified++;
      } else if (item.price < PRICE_BUY_PROMISING_THRESHOLD) {
        promisingUpdates.push(itemDetails);
      } else if (item.priceDropPercent > priceDropPercentPromisingThreshold) {
        promisingUpdates.push(itemDetails + ' ' + getFormattedPriceDropNotifyInfo(item));
      }
    });

    var numPromisingUpdates = promisingUpdates.length;
    if (numPromisingUpdates > 0) {
      notify('Promising Updates', promisingUpdates.join('\n----------------------------------------------\n'));
    }

    badgeText = String(numItemsToBeNotified + numPromisingUpdates);
  }

  updateBadgeText(badgeText, '#009900');
}

function getFormattedPriceDropNotifyInfo(item) {
  return '(↓' + item.priceDropPercent + '% from $' + item.initialPrice + ')';
}

function notifyError(badgeText, errorText, skipSendMail) {
  if (badgeText) {
    updateBadgeText(badgeText, DEFAULT_BADGE_BG_COLOR);
  }
  notify('Uh Oh!', errorText, ERROR_ICON)

  if (!skipSendMail) {
    gMail({
      subject: 'ERROR: ' + errorText
    })
  }
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
  var gMailUrl = 'https://script.google.com/macros/s/AKfycby_BL00QIlqIJm5SuK_MgXazQDeQfwzxwYrU9aLTykzkD6BGr4/exec';
  var params = $.extend({}, opts, {
    service : 'mailMe',
    subject : '[AWT] ' + opts.subject
  });

  $.get(gMailUrl, params)
  .fail(function(jqXhr, status) {
    notify('Uh Oh!', 'Unable to send GMail!', ERROR_ICON);
  });
}

function unfurlChromeXtnfiedURL(chromeXtnfiedURL) {
  return BASE_URL + chromeXtnfiedURL.replace(CHROME_XTN_URL_PREFIX, '');
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

function fetchGoodreadsRating(request, requesterID) {
  var nonKindleProductID = request.nonKindleProductID;
  var response = $.extend({}, request, {'operation': 'displayGoodreadsRating'});

  $.ajax({
    url: 'https://www.goodreads.com/search.xml',
    data: {
      key: 'dqVlK3OyDT5HWC0j5HOVtA',
      q: nonKindleProductID ? nonKindleProductID : request.productID
    },
    dataType: 'xml'
  })
  .done(function(xml) {
    var ratingDetails = {};
    var jqXml = $(xml);
    if (parseInt(jqXml.find('total-results').text()) === 1) {
      ratingDetails.goodreadsID = jqXml.find('best_book>id').text();
      ratingDetails.averageRating = jqXml.find('average_rating').text();
      ratingDetails.ratingsCount = jqXml.find('ratings_count').text();
    } else {
      ratingDetails.unavailable = true;
    }

    response.ratingDetails = ratingDetails;
  })
  .fail(function(jqXHR, textStatus, errorThrown ) {
    response.ratingDetails = {failed: true};
  }).always(function() {
    chrome.tabs.sendMessage(requesterID, response);
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
