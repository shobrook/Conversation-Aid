/* Globals */


// For calling GET and SET to the extension's local storage
const storage = chrome.storage.local;

// Creates an asynchronous HTTP GET request
const get = (url, credentials, callback) => {
  let xhr = new XMLHttpRequest();
  xhr.onreadystatechange = () => {
    if (xhr.readyState == 4 && xhr.status == 200) {
      callback(xhr.responseText);
    }
  }

  xhr.open("GET", url, true);
  xhr.setRequestHeader("Authorization", "Basic " + btoa(credentials["username"] + ':' + credentials["password"]));
  xhr.send(null);
}

/*
// Creates an asynchronous HTTP POST request
const post = (url, payload, callback) => {
	let xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader("Content-type", "application/json");
	xhr.onreadystatechange = () => {
		if (xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) // readyState == 4
			callback(xhr.responseText);
	}
	xhr.send(JSON.stringify(payload));
}
*/

// Sends a message to content scripts running in the current tab
const message = (content) => {
	chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
		let activeTab = tabs[0];
		chrome.tabs.sendMessage(activeTab.id, content);
	});
}

/**
 * Constructs URL for Watson API request.
 *
 * messages - Either a message or a list of messages.
 *
 * @return String               URL for API request.
 */
const urlConstruction = (messages, isList=false) => {
	// TODO: Append emotion feature to end of API request URL

	let endpoint = "https://gateway.watsonplatform.net/tone-analyzer/api/v3/tone?version=2018-05-01&text=";

	if (isList) {
		messages = messages.join(" ");
	}

	var newUrl = endpoint + messages.replace(/ /, "%20"); // + features requested
	console.log(newUrl)
	return newUrl
}

// Transforms a Messages object into a SentimentTable object
const analyzeSentiment = (messages) => {
	// TODO: (v2) Use VADER-js to analyze the compound valence of the conversation
	// TODO: Output ordered list of dictionaries, formatted as [{"message": "...", "received": "...", "sentiment": 0}, ...]


	let allMessages = ""

	// Iterate through messages and analyze sentiment for each message.
	messages.forEach(function(element) {

		// Create string of all messages.
		allMessages = allMessages.concat("\n" + element)
		get(urlConstruction(element), credentials, responseHandler);
	});

	// TODO: Sentiment analysis on all messages together
	// JON CHECK THIS OUT

	/**
	 * To isolate sentiment impact of each msg, sentiment scores of (four msg) Cluster 1 - (three msg) Cluster 2
	 *
	 *  Cluster 1: ABCD
	 *  Cluster 2: ABC
	 *
	 *	Cluster 1 - Cluster 2 isolates the impact of D, in context
	 */

	let trips_of_messages = []

	for (var i = 0; i <= messages.length - 2; i++) {
		trips_of_messages.append(messages[i].get("message") + " " + messages[i + 1].get("message") + " " + messages[i + 2].get("message"))
	}

	let quads_of_messages = []

	for (var i = 0; i <= messages.length - 3; i++) {
		quads_of_messages.append((messages[i]["message"] + " " + messages[i + 1]["message"] + " " + messages[i + 2]["message"] + " " + messages[i + 3]["message"], messages[i + 3]["author"], messages[i + 3]["message"])
	}

	message_sentiments = []

	for (var index = 0; index < quads_of_messages.length; index++) {
		four_msg_combo, author, last_message = quads_of_messages[index][0], quads_of_messages[index][1], quads_of_messages[index][2]
		three_msg_combo = trips_of_messages[index]
		print("Four COMBO:", four_msg_combo)
		print("AUTHOR:", author)
		print("LAST_MESSAGE:", last_message)

		// TODO:Get sentiment of each message combo. Depends on Request Handler
		four_msg_sentiment = TextBlob(four_msg_combo).sentiment.polarity
		three_msg_sentiment = TextBlob(three_msg_combo).sentiment.polarity

		// message_sentiments = [(last_message_hash, sentiment, author), ... ]
		message_sentiments.append((last_message_hash, four_msg_sentiment - three_msg_sentiment, author))
	}


	return [
    {sentiment: -10, id: 0, received: true},
    {sentiment: 40, id: 1, received: false},
    {sentiment: -10, id: 2, received: true},
    {sentiment: -50, id: 3, received: true},
    {sentiment: 30, id: 4, received: false},
    {sentiment: 60, id: 5, received: true},
    {sentiment: 50, id: 6, received: true},
    {sentiment: -20, id: 7, received: false},
    {sentiment: -10, id: 8, received: true},
    {sentiment: 40, id: 9, received: false},
    {sentiment: -10, id: 10, received: true},
    {sentiment: -50, id: 11, received: true},
    {sentiment: 30, id: 12, received: false},
    {sentiment: 60, id: 13, received: true},
    {sentiment: 50, id: 14, received: true},
    {sentiment: -20, id: 15, received: false},
    {sentiment: -20, id: 16, received: false}
  ] // TEMP
}


/* Event Handlers */


// Listens for messenger.com to be loaded and tells listeners.js to inject the event handlers
chrome.webNavigation.onCompleted.addListener((details) => {
	// BUG: Message is sometimes sent before the DOM is fully loaded
	if (details.url.includes("messenger.com")) {
		message({"message": "injectListeners"});
	}
});

/*
// Listens for when the extension is first installed or updated
chrome.runtime.onInstalled.addListener((details) => {
	if (details.reason == "install") {
		console.log("User has installed TypeSense for the first time on this device.");
	} else if (details.reason == "update") {
		let thisVersion = chrome.runtime.getManifest().version;
		console.log("Updated from " + details.previousVersion + " to " + thisVersion + " :)");
	}
});
*/

// Opens long-lived port connections with content scripts
chrome.runtime.onConnect.addListener((port) => {
	port.onMessage.addListener((msg) => {
    if (port.name == "listener") { // Handles requests from listeners.js
      // OPTIMIZE: Compare msg (scraped messages) w/ what's currently in local storage; find where the two sets stop intersecting,
      // then analyze the remaining part of msg and append it to the local set, and slice to ensure it's at length 17

      let sentimentTable = analyzeSentiment(msg.messages);

      storage.set({"currentThread": sentimentTable}, () => { // TODO: Memoize conversations
        console.log("Populated conversation's sentiment table.");
      });

      // Updates the browser action icon according to sentiment change
      if (sentimentTable[sentimentTable.length - 1]["sentiment"] >= sentimentTable[sentimentTable.length - 2]["sentiment"]) { // Sentiment increased
        chrome.browserAction.setIcon({path: "../assets/icon_green.png"});
      } else { // Sentiment decreased
        chrome.browserAction.setIcon({path: "../assets/icon_red.png"});
      }
    }
  });
});
