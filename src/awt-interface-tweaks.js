$(function() {

  registerListeners();

  document.title = document.title.replace(/^AmazonSmile: /, '');

  var productID = $('[name^="ASIN"]').val();
  var isKindlePage = isKindleProductPage();

  // Disable Keepa for Kindle Products and enable for everything else.
  chrome.runtime.sendMessage({operation: 'manageKeepa', enableExtension: !isKindlePage});

  if (isKindlePage) {
    var bookName = $('#ebooksProductTitle').text().replace('/\s+/g', '');
    var bookImageElt = $('#ebooks-img-wrapper, #mainImageContainer');
    showGoodreadsRating(bookName, productID, bookImageElt);
  }

  tweakViewingOfAlreadyPurchasedItems(productID, isKindlePage);

  highlightIfProductInWishList(productID);

  // Internal functions
  function registerListeners() {
    chrome.runtime.onMessage.addListener(function(request) {
      var requestedOperation = request.operation;
      if(requestedOperation === 'displayGoodreadsRating') {
        _addGoodreadsRatingInfoToPage(request);
      } else if (requestedOperation === 'highlightWishListMembership') {
        if (request.wishListName) {
          var highlightElt = '<b style="background-color: green; color: white;">&nbsp;' + request.wishListName + '&nbsp;</b> ';
          if (request.wishListURL) {
            highlightElt = '<a target="_blank" href="' + request.wishListURL + '">' + highlightElt + '</a>';
          }
          $('#btAsinTitle, #productTitle, #title').first().prepend(highlightElt);
        }
      } else if (requestedOperation === 'paintGoodreadsRatings') {
        _paintGoodreadsRatings();
      }
    });
  }

  function tweakViewingOfAlreadyPurchasedItems(productID, isKindlePage) {
    var orderUpdateSection = $('#instantOrderUpdate_feature_div, .iou_div');
    if (orderUpdateSection.length > 0) {
      if (isKindlePage) {
        $('#kicsBuyBoxForm').hide();
        $('form[name="addToWishlist"]').hide();
      }
    }
  }

  function isKindleProductPage() {
    var productFormatElt = $("#formats .swatchElement.selected, .a-active.mediaTab_heading")
    return productFormatElt.text().match(/\s*(Kindle|eTextbook)/);
  }

  function showGoodreadsRating(bookName, productID, bookImageElt) {
    if (productID && bookName) {
      bookImageElt.addClass('awtRatingContainer awtGoodreadified');
      $('<span/>', {
        id: 'awtGoodreadsRating_' + productID,
        text: '...'
      })
        .css({
          'position': 'absolute',
          'right': '-8%',
          'top' : '-1%',
          'background': 'gray',
          'color': '#fff',
          'border-radius': '100%',
          'padding': '10px',
          'font-size': '20px',
          'font-weight': 'bold',
          'z-index': '999',
          'box-shadow': 'black -1px 2px 12px 0px' 
        })
        .prependTo(bookImageElt.find('img').parent());

      chrome.runtime.sendMessage({
        operation: 'fetchGoodreadsRating',
        productID: productID,
        bookName: bookName
      });
    }
  }

  function _addGoodreadsRatingInfoToPage(request) {
    var ratingDetails = request.ratingDetails;
    var avgRating, goodreadsUrl, ratingBadgeColor, ratingsCount;
    var isUsingNonKindleProductID = request.nonKindleProductID;
    var goodreadsRatingElt = $('span#awtGoodreadsRating_' + request.productID);
    var ratingContainerElt = goodreadsRatingElt.closest('.awtRatingContainer');
    var isSingleItemPage = ratingContainerElt.attr("id") === 'ebooks-img-wrapper';

    if (ratingDetails.failed || (ratingDetails.unavailable && isUsingNonKindleProductID)) {
      goodreadsUrl = 'https://www.goodreads.com/search?query=' + request.bookName;
      ratingsCount = '';
      if (ratingDetails.failed) {
        avgRating = 'ERR';
        ratingBadgeColor = 'brown';
      } else {
        avgRating = '???';
        ratingBadgeColor = 'orange';
      }
    } else if (ratingDetails.unavailable) {
      _showGoodreadsRatingUsingNonKindleProductID(request);
      return;
    } else {
      goodreadsUrl = 'https://www.goodreads.com/book/show/' + ratingDetails.goodreadsID;
      avgRating = ratingDetails.averageRating;
      if (avgRating < 3.9) {
        ratingBadgeColor = 'red';
        ratingContainerElt.css('opacity', '0.15')
          .hover(
            function() {
              ratingContainerElt.css('opacity', '0.5')
            },
            function() {
              ratingContainerElt.css('opacity', '0.15')
            }
          );
      } else {
        ratingBadgeColor = 'green';
      }

      // Pretty print. Insert commas appropriately and wrap in ().
      ratingsCount = ' (' + ratingDetails.ratingsCount.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ')';
    }

    ratingContainerElt.data('goodreadsRating', (isNaN(avgRating) ? 9999 : Number(avgRating)));

    var goodreadsRatingEltHtml = '<a href=' + goodreadsUrl + ' target=_blank style="color:white">' + avgRating + '</a><div style="font-size: 10px">' + ratingsCount + '</div>';
    goodreadsRatingElt
      .css('background-color', ratingBadgeColor)
      .html(goodreadsRatingEltHtml);
    if (!isSingleItemPage) {
      goodreadsRatingElt.css({
        'right': '8%',
        'font-size': '16px'
      });
    }

    if ($('span[id^=awtGoodreadsRating_]:contains("...")').length === 0) {
      $('.awtRatingContainer').sort(function(container1, container2) {
        // sort in ascending order of rating
        return $(container1).data('goodreadsRating') - $(container2).data('goodreadsRating');
      }).each(function() {
        var jqThis = $(this);
        jqThis.parent().prepend(jqThis);
      });
    }
  }

  function _showGoodreadsRatingUsingNonKindleProductID(request) {
    var unableToFetch = false;
    var bookName = request.bookName;
    var productID = request.productID;
    var nonKindleProductUrl = $('#formats .format :contains("Paperback") a').attr('href');
    if (nonKindleProductUrl) {
      var goodReadsRatingContainer = $('span#awtGoodreadsRating_' + productID);

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
          unableToFetch = true;
          notify('Uh Oh!', 'Unable to determine Non Kindle Product ID of "' + bookName + '", for retrieving Goodreads rating');
        }
      })
      .fail(function() {
        unableToFetch = true;
        notify('Uh Oh!', 'Unable to fetch Goodreads rating for "' + bookName + '" using Non Kindle Product URL : ' +
          chrome.runtime.lastError);
      })
      .always(function() {
        if (unableToFetch) {
          request.nonKindleProductID = 999;
          _addGoodreadsRatingInfoToPage(request);
        }
      });
    } else {
      request.nonKindleProductID = 999;
      _addGoodreadsRatingInfoToPage(request);
    }
  }

  function highlightIfProductInWishList(productID) {
    if (productID) {
      chrome.runtime.sendMessage({operation: 'checkIfInWishList', productID: productID});
    }
  }

  function _paintGoodreadsRatings() {
    $('#resultsCol .s-result-item:not(.awtGoodreadified)').each(function() {
      var bookImageElt = $(this);
      var bookName = bookImageElt.find('.s-access-title').text()
      var productID = bookImageElt.attr('data-asin');
      showGoodreadsRating(bookName, productID, bookImageElt);
    });
  }

});
