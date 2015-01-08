$(function() {
  $('#paintGoodreadsRatings').click(function() {
    chrome.runtime.sendMessage({operation: 'paintGoodreadsRatings'});
    window.close();
  });

  $('#wishlists').click(function() {
    chrome.runtime.sendMessage({operation: 'goToWishlists'});
  });

  $('#dailyDeals').click(function() {
    chrome.runtime.sendMessage({operation: 'goToDailyDeals'});
  });

  $('#checkNow').click(function() {
    chrome.runtime.sendMessage({operation: 'fetchAndAnalyzeWishLists'});
    window.close();
  });
});