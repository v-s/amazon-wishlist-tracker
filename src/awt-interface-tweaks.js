$(function() {

  registerListeners();
  
  var productID = $('[name^="ASIN"]').val();

  var kindleNameRegexMatch = isKindleProductPage();
  if (kindleNameRegexMatch) {
    showGoodreadsRating(kindleNameRegexMatch[1], productID);
    hideKindleNags();
  }

  highlightIfProductInWishList(productID);

  // Internal functions
  function registerListeners() {
    chrome.runtime.onMessage.addListener(function(request) {
      var requestedOperation = request.operation;
      if (requestedOperation === 'highlightWishListMembership') {
        if (request.wishList) {
          $('#btAsinTitle, #productTitle').prepend('<b style="background-color: green; color: white;">&nbsp;' + request.wishList + '&nbsp;</b> ');
        }
      } else if(requestedOperation === 'displayGoodreadsRating') {
        _addGoodreadsRatingInfoToPage(request);
      }
    });
  }

  function isKindleProductPage() {
    return $('#btAsinTitle, #productTitle').text().match(/^([^\[]+)\[Kindle Edition\]$/);
  }

  function showGoodreadsRating(bookName, productID) {
    if (productID && bookName) {
      chrome.runtime.sendMessage({
        operation: 'fetchGoodreadsRating',
        productID: productID,
        bookName: bookName
      });
    }
  }

  function _addGoodreadsRatingInfoToPage(request) {
    var ratingDetails = request.ratingDetails;
    var avgRating, goodreadsUrl, infoColor, ratingsCount;

    if (ratingDetails.failed || ratingDetails.unavailable) {
      goodreadsUrl = 'https://www.goodreads.com/search?query=' + request.bookName;
      avgRating = ratingDetails.failed ? 'Error' : 'Unavailable';
      ratingsCount = '';
      infoColor = 'red';
    } else {
      goodreadsUrl = 'https://www.goodreads.com/book/show/' + ratingDetails.goodreadsID;
      avgRating = ratingDetails.averageRating;
      // Pretty print. Insert commas appropriately and wrap in ().
      ratingsCount = ' (' + ratingDetails.ratingsCount.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ratings)';
      infoColor = 'brown';
    }

    var goodreadsRatingEltHtml = '<a href=' + goodreadsUrl + ' target=_blank><b>Goodreads</b></a>: <b style=color:' + infoColor + '>' + avgRating + '</b>' + 
      ratingsCount + ' | Amazon ';

    var amazonRatingElt = $('div.buying span.asinReviewsSummary').closest('div')
    if (amazonRatingElt.length === 1) {
      amazonRatingElt.prepend(goodreadsRatingEltHtml);
    } else {
      $('<div class="buying">' + goodreadsRatingEltHtml + '</div>').insertAfter($('div.buying h1.parseasinTitle').closest('div'));
    }
  }

  function hideKindleNags() {
    $('div.kindleBanner')
      .css('padding-bottom', '0px')
      .css('visibility', 'hidden');

    $('#audiobooks_meta_binding_winner').hide();
    $('#audiobooks_meta_binding_body').hide();
    $('#audiobooks_digital_meta_binding_winner').hide();

    $('img[alt="Kindle Unlimited"]').closest('table').hide();
  }

  function highlightIfProductInWishList(productID) {
    if (productID) {
      chrome.runtime.sendMessage({operation: 'checkIfInWishList', productID: productID});
    }
  }

});