var currentLocation = location.href
if (currentLocation.match(/www\.amazon\.com/) && jQuery("#nav-link-yourAccount").text().toLowerCase().indexOf("sign in") == -1) {
	location.href = currentLocation.replace(/www\.amazon\.com/, "smile.amazon.com")
}