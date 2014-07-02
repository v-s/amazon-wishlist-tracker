$(function() {

  registerListeners();
  hideAnnoyingStuff();
  highlightIfProductInWishList();

  // Internal functions
  function registerListeners() {
    chrome.runtime.onMessage.addListener(function(request) {
      if (request.operation == 'checkIfInWishList' && request.wishList) {
        $('#btAsinTitle').prepend('<b style="background-color: green; color: white;">' + request.wishList + '</b> ');
      }
    });
  }

  function hideAnnoyingStuff() {
    $("div.kindleBanner")
    .css('padding-bottom', '0px')
    .css('visibility', 'hidden');
  }

  function highlightIfProductInWishList() {
    var productID = $('[name="ASIN.0"]').val()
    if (productID) {
      chrome.runtime.sendMessage({operation: 'checkIfInWishList', productID: productID});
    }
  }

});