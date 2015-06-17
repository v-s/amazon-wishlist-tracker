$(function() {

  registerListeners();

  document.title = document.title.replace(/^AmazonSmile: /, '');

  var productID = $('[name^="ASIN"]').val();

  var kindleNameRegexMatch = isKindleProductPage();

  // Disable Keepa for Kindle Products and enable for everything else.
  chrome.runtime.sendMessage({operation: 'manageKeepa', enableExtension: !kindleNameRegexMatch});

  if (kindleNameRegexMatch) {
    var amazonRatingElt = $('#averageCustomerReviews');
    showGoodreadsRating(kindleNameRegexMatch[1], productID, amazonRatingElt);

    hideKindleNags();
  }

  tweakViewingOfAlreadyPurchasedItems(productID, kindleNameRegexMatch);

  highlightIfProductInWishList(productID);

  // Internal functions
  function registerListeners() {
    chrome.runtime.onMessage.addListener(function(request) {
      var requestedOperation = request.operation;
      if(requestedOperation === 'displayGoodreadsRating') {
        _addGoodreadsRatingInfoToPage(request);
      } else if (requestedOperation === 'highlightWishListMembership') {
        if (request.wishList) {
          $('#btAsinTitle, #productTitle').prepend('<b style="background-color: green; color: white;">&nbsp;' + request.wishList + '&nbsp;</b> ');
        }
      } else if (requestedOperation === 'paintGoodreadsRatings') {
        _paintGoodreadsRatings();
      }
    });
  }

  function tweakViewingOfAlreadyPurchasedItems(productID, kindleNameRegexMatch) {
    var orderUpdateSection = $('#instantOrderUpdate_feature_div, .iou_div');
    if (orderUpdateSection.length > 0) {
      if (kindleNameRegexMatch) {
        $('#kicsBuyBoxForm').hide();
        $('form[name="addToWishlist"]').hide();
      }
    }
  }

  function isKindleProductPage() {
    return $('#title').text().replace(/\n/g, "").trim().replace(/\s{2,}/g, " ").match(/^(.+)Kindle Edition$/);
  }

  function showGoodreadsRating(bookName, productID, amazonRatingElt, ratingContainerElt, skipNonKindleRatingFetch) {
    if (productID && bookName) {
      ratingContainerElt = ratingContainerElt || amazonRatingElt;
      ratingContainerElt.addClass('awtRatingContainer');
      var goodreadsRatingContainerHtmlPrefix = '<span id="awtGoodReadsRating_' + productID + '">Fetching Goodreads Rating...';
      amazonRatingElt.addClass('awtGoodreadified');
      var targetElement = (amazonRatingElt === ratingContainerElt) ? amazonRatingElt : amazonRatingElt.parent();
      targetElement.prepend(goodreadsRatingContainerHtmlPrefix + ' | Amazon </span>');

      chrome.runtime.sendMessage({
        operation: 'fetchGoodreadsRating',
        productID: productID,
        bookName: bookName,
        skipNonKindleRatingFetch: skipNonKindleRatingFetch
      });
    }
  }

  function _addGoodreadsRatingInfoToPage(request) {
    var ratingDetails = request.ratingDetails;
    var avgRating, goodreadsUrl, infoColor, ratingsCount;
    var isUsingNonKindleProductID = request.nonKindleProductID;
    var goodreadsRatingElt = $('span#awtGoodReadsRating_' + request.productID);

    if (ratingDetails.failed || (ratingDetails.unavailable && (isUsingNonKindleProductID || request.skipNonKindleRatingFetch))) {
      goodreadsUrl = 'https://www.goodreads.com/search?query=' + request.bookName;
      avgRating = ratingDetails.failed ? 'Error' : 'Unavailable';
      ratingsCount = '';
      infoColor = 'red';
    } else if (ratingDetails.unavailable) {
      _showGoodReadsRatingUsingNonKindleProductID(request);
      return;
    } else {
      goodreadsUrl = 'https://www.goodreads.com/book/show/' + ratingDetails.goodreadsID;
      avgRating = ratingDetails.averageRating;
      if (avgRating < 3.9) {
        var ratingContainerElt = goodreadsRatingElt.closest('.awtRatingContainer')
        ratingContainerElt.css('opacity', '0.15')
          .hover(
            function() {
              ratingContainerElt.css('opacity', '0.5')
            },
            function() {
              ratingContainerElt.css('opacity', '0.15')
            }
          );

        ratingContainerElt.appendTo(ratingContainerElt.parent());
      }

      // Pretty print. Insert commas appropriately and wrap in ().
      ratingsCount = ' (' + ratingDetails.ratingsCount.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ratings)';
      infoColor = 'brown';
    }

    var goodReadsLinkTextSuffix = isUsingNonKindleProductID ? ' (Non Kindle)' : '';
    var goodreadsRatingEltHtml = '<a href=' + goodreadsUrl + ' target=_blank><b>Goodreads' + goodReadsLinkTextSuffix + '</b></a>: <b style=color:' + infoColor + '>' + avgRating + '</b>' +
      ratingsCount + ' | Amazon ';
    goodreadsRatingElt.html(goodreadsRatingEltHtml);
  }

  function _showGoodReadsRatingUsingNonKindleProductID(request) {
    var bookName = request.bookName;
    var productID = request.productID;
    var nonKindleProductUrl = $('#paperback_meta_binding_winner td.tmm_bookTitle a, #hardcover_meta_binding_winner td.tmm_bookTitle a').attr('href');
    if (nonKindleProductUrl) {
      var goodReadsRatingContainer = $('span#awtGoodReadsRating_' + productID);
      var goodReadsRatingContainerText = goodReadsRatingContainer.text();
      goodReadsRatingContainer.text(goodReadsRatingContainerText.replace('Fetching ', 'Fetching Non Kindle '));

      $.get(nonKindleProductUrl)
      .done(function(response) {
        var nonKindleProductID = $(response).find('[name^="ASIN"]').val();
        if(nonKindleProductID) {
          chrome.runtime.sendMessage({
            operation: 'fetchGoodreadsRating',
            bookName: bookName,
            nonKindleProductID: nonKindleProductID,
            productID: productID
          });
        } else {
          notify('Uh Oh!', 'Unable to determine Non Kindle Product ID of "' + bookName + '", for retrieving Goodreads rating');
        }
      })
      .fail(function() {
        notify('Uh Oh!', 'Unable to fetch Goodreads rating for "' + bookName + '" using Non Kindle Product URL : ' + chrome.runtime.lastError);
      });
    }
  }

  function hideKindleNags() {
    $('div.kindleBanner')
      .css('padding-bottom', '0px')
      .css('visibility', 'hidden');

    $('#audiobooks_meta_binding_winner').remove();
    $('#audiobooks_meta_binding_body').remove();
    $('#audiobooks_digital_meta_binding_winner').remove();

    $('img[alt="Kindle Unlimited"]').closest('table').remove();
    $('img[alt="Read for Free"]').closest('div.kicsBoxContents').remove();
    $('div.kicsGifting').remove();
    $('#kindle_redeem_promo_link').remove();
    $('#kcpAppBaseBox_').closest('tr').remove();
    $('#tafContainerDiv').closest('tr').remove();
    $('#hushpupyPromoWidget').closest('tr').remove();
    $('#about-ep-price').closest('tr').remove();
    $('#hero-quick-promo_feature_div').closest('tr').remove();
    $('#kcpApp-form').closest('tr').remove();
    $('#kfs-container').remove();
    $('a[name=postPS]').remove();
    $('div[id=ps-content]').insertAfter($('table.twisterMediaMatrix'));
  }

  function highlightIfProductInWishList(productID) {
    if (productID) {
      chrome.runtime.sendMessage({operation: 'checkIfInWishList', productID: productID});
    }
  }

  function _paintGoodreadsRatings() {
    $('#resultsCol .a-icon-star:not(.awtGoodreadified)').each(function() {
      var amazonRatingElt = $(this);
      var containerElt = amazonRatingElt.closest('li[data-asin]');
      var bookName = containerElt.find('.s-access-title').text()
      var productID = containerElt.attr('data-asin');
      showGoodreadsRating(bookName, productID, amazonRatingElt, containerElt, true);
    });
  }

});