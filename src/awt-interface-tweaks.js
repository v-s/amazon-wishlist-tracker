$(function() {

  registerListeners();

  const productID = $('[name^="ASIN"]').val();
  const isbn13Code = getISBN13CodeIfPresent();
  const isKindleBook = isKindleBookPage();

  if (isbn13Code || isKindleBook) {
    const bookName = $("#ebooksProductTitle, #productTitle").text().replace('/\s+/g', '');
    const bookImageElt = $('#booksImageBlock_feature_div, #imageBlockNew_feature_div');
    showGoodreadsRating(bookImageElt, bookName, productID, isbn13Code);
  }

  highlightIfProductInWishList(productID);

  // Internal functions
  function registerListeners() {
    chrome.runtime.onMessage.addListener(function(request) {
      const requestedOperation = request.operation;
      if(requestedOperation === 'displayGoodreadsRating') {
        _addGoodreadsRatingInfoToPage(request);
      } else if (requestedOperation === 'highlightWishListMembership') {
        if (request.wishListName) {
          let highlightElt = '<b style="background-color: green; color: white;">&nbsp;' + request.wishListName + '&nbsp;</b> ';
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

  function getISBN13CodeIfPresent() {
    const isbnSectionElt = $("#printEditionIsbn_feature_div, #isbn_feature_div, #productDetailsTable");
    const isbn13Match = $(":contains('ISBN-13:')").parent().text().match(/ISBN-13:\s*(\d+(?:-\d+)+)/);
    return (isbn13Match && isbn13Match.length == 2) ? isbn13Match[1] : null;
  }

  function isKindleBookPage() {
    const productFormatElt = $("#formats .swatchElement.selected, .a-active.mediaTab_heading")
    return productFormatElt.text().match(/\s*(Kindle|eTextbook)/);
  }

  function showGoodreadsRating(bookImageElt, bookName, productID, isbn13Code) {
    if ((isbn13Code || productID) && bookName) {
      $('<span/>', {
        id: 'awtGoodreadsRating_' + productID,
        text: '...',
        class: 'awtRatingContainer'
      })
        .css({
          'position': 'absolute',
          'background': 'gray',
          'color': '#fff',
          'border-radius': '100%',
          'padding': '10px',
          'font-size': '20px',
          'font-weight': 'bold',
          'z-index': '999',
          'box-shadow': 'black -1px 2px 12px 0px'
        })
        .prependTo(bookImageElt);

      chrome.runtime.sendMessage({
        operation: 'fetchGoodreadsRating',
        isbn13Code: isbn13Code,
        productID: productID,
        bookName: bookName
      });
    }
  }

  function _addGoodreadsRatingInfoToPage(request) {
    const ratingDetails = request.ratingDetails;
    let avgRating, goodreadsUrl, ratingBadgeColor, ratingsCount;
    const goodreadsRatingElt = $('span#awtGoodreadsRating_' + request.productID);
    const ratingContainerElt = goodreadsRatingElt.closest('.awtRatingContainer');
    const isMultipleItemsPage = $('span[id^=awtGoodreadsRating_]').length > 1;

    if (ratingDetails.failed || ratingDetails.unavailable) {
      goodreadsUrl = 'https://www.goodreads.com/search?query=' + request.bookName;
      ratingsCount = '';
      if (ratingDetails.failed) {
        avgRating = 'ERR';
        ratingBadgeColor = 'brown';
      } else {
        avgRating = '???';
        ratingBadgeColor = 'orange';
      }
    } else {
      goodreadsUrl = 'https://www.goodreads.com/book/show/' + ratingDetails.goodreadsID;
      avgRating = ratingDetails.averageRating;
      if (avgRating < 3.9) {
        ratingBadgeColor = 'red';
        ratingContainerElt.siblings().css('opacity', '0.15')
          .hover(
            function() {
              $(this).css('opacity', '1.0');
            },
            function() {
              $(this).css('opacity', '0.15');
            }
          );
      } else {
        ratingBadgeColor = 'green';
      }

      // Pretty print. Insert commas appropriately and wrap in ().
      ratingsCount = ' (' + ratingDetails.ratingsCount.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ')';
    }

    ratingContainerElt.data('goodreadsRating', (isNaN(avgRating) ? 9999 : Number(avgRating)));

    const goodreadsRatingEltHtml = '<a href=' + goodreadsUrl + ' target=_blank style="color:white">' + avgRating + '</a><div style="font-size: 10px">' + ratingsCount + '</div>';
    goodreadsRatingElt
      .css('background-color', ratingBadgeColor)
      .html(goodreadsRatingEltHtml);
    if (isMultipleItemsPage) {
      goodreadsRatingElt.css({
        'font-size': '16px',
        'top': '2%',
        'left': '7%'
      });
    }

    if ($('span[id^=awtGoodreadsRating_]:contains("...")').length === 0) {
      $('.awtRatingContainer').sort(function(container1, container2) {
        // sort in ascending order of rating
        return $(container1).data('goodreadsRating') - $(container2).data('goodreadsRating');
      }).each(function() {
        const jqThis = $(this);
        const paintedElt = jqThis.closest('.awtRatingPainted');
        paintedElt.prependTo(paintedElt.parent());
      });
    }
  }

  function highlightIfProductInWishList(productID) {
    if (productID) {
      chrome.runtime.sendMessage({operation: 'checkIfInWishList', productID: productID});
    }
  }

  function _paintGoodreadsRatings() {
    $('#resultsCol .s-result-item:not(.awtRatingPainted)').each(function() {
      const containerElt = $(this);
      containerElt.addClass('awtRatingPainted');
      const bookImageElt = containerElt.find('.s-item-container');
      const bookName = containerElt.find('.s-access-title').text()
      const productID = containerElt.attr('data-asin');
      showGoodreadsRating(bookImageElt, bookName, productID, /* isbn13 = */null);
    });
  }

});
