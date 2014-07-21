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
      if (request.operation === 'checkIfInWishList' && request.wishList) {
        $('#btAsinTitle, #productTitle').prepend('<b style="background-color: green; color: white;">&nbsp;' + request.wishList + '&nbsp;</b> ');
      }
    });
  }

  function isKindleProductPage() {
    return $('#btAsinTitle, #productTitle').text().match(/^([^\[]+)\[Kindle Edition\]$/);
  }

  function showGoodreadsRating(bookName, productID) {
    $.ajax({
      url: 'https://www.goodreads.com/search.xml',
      data: {
        key: 'dqVlK3OyDT5HWC0j5HOVtA',  
        q: productID
      },
      dataType: 'xml'
    })
    .done(function(xml) {
      var jqXml = $(xml);
      if (parseInt(jqXml.find('total-results').text()) === 1) {
        _addGoodreadsRatingInfoToPage(bookName, jqXml.find('best_book>id').text(), jqXml.find('average_rating').text(), jqXml.find('ratings_count').text());
      } else {
        _addGoodreadsRatingInfoToPage(bookName);
      }
    })
    .fail(function() {
      _addGoodreadsRatingInfoToPage(bookName);
    });
  }

  function _addGoodreadsRatingInfoToPage(bookName, goodreadsId, avgRating, ratingsCount) {
    if (goodreadsId) {
      goodreadsUrl = 'https://www.goodreads.com/book/show/' + goodreadsId;
      // Pretty print. Insert commas appropriately and wrap in ().
      ratingsCount = ' (' + ratingsCount.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ratings)';
      infoColor = 'brown';
    } else {
      goodreadsUrl = 'https://www.goodreads.com/search?query=' + bookName;
      avgRating = 'Unavailable';
      ratingsCount = '';
      infoColor = 'red';
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

  function highlightIfProductInWishList() {
    
    if (productID) {
      chrome.runtime.sendMessage({operation: 'checkIfInWishList', productID: productID});
    }
  }

});