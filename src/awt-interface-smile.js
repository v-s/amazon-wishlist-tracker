var currentLocation = location.href
if (currentLocation.match(/www\.amazon\.com/)) {
	location.href = currentLocation.replace(/www\.amazon\.com/, "smile.amazon.com")
}