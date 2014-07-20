$(function() {

  registerListeners();
  
  var kindleNameRegexMatch = isKindleProductPage();
  if (kindleNameRegexMatch) {
    showGoodreadsRating(kindleNameRegexMatch[1]);
    hideKindleNags();
  }

  highlightIfProductInWishList();

  // Internal functions
  function registerListeners() {
    chrome.runtime.onMessage.addListener(function(request) {
      if (request.operation == 'checkIfInWishList' && request.wishList) {
        $('#btAsinTitle, #productTitle').prepend('<b style="background-color: green; color: white;">&nbsp;' + request.wishList + '&nbsp;</b> ');
      }
    });
  }

  function isKindleProductPage() {
    return $('#btAsinTitle, #productTitle').text().match(/^([^\[]+)\[Kindle Edition\]$/);
  }

  function showGoodreadsRating(bookName) {
    var isbnID = $('#paperback_meta_binding_winner>tr').attr('id');
    if (isbnID) {
      $.getJSON('https://www.goodreads.com/book/review_counts.json', {
        key: 'dqVlK3OyDT5HWC0j5HOVtA',
        isbns: isbnID.split('_')[1]
      }).done(function(reviewStats) {
        var goodreadsUrl;
        var goodreadsRating;
        var goodreadsRatingCount;
        if (reviewStats) {
          reviewStats = reviewStats.books[0];
          goodreadsUrl = 'https://www.goodreads.com/book/show/' + reviewStats.id;
          goodreadsRating = reviewStats.average_rating;
          goodreadsRatingCount = ' (' + reviewStats.work_ratings_count + ' ratings)';
        } else {
          goodreadsUrl = 'https://www.goodreads.com/search?query=' + bookName;
          goodreadsRating = 'Unavailable';
          goodreadsRatingCount = '';
        }

        jQuery("div.buying span.asinReviewsSummary").parent()
          .prepend('<a href=' + goodreadsUrl + ' target=_blank><b>Goodreads</b></a>: <b style=color:brown>' + goodreadsRating + '</b>' + goodreadsRatingCount + ' | Amazon ');
      });
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
    var productID = $('[name^="ASIN"]').val()
    if (productID) {
      chrome.runtime.sendMessage({operation: 'checkIfInWishList', productID: productID});
    }
  }

});