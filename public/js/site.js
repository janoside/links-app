function copyTextToClipboard(text) {
	// navigator.clipboard won't exist if it's not secure (i.e. http on non-localhost)
	// so there's a backup method
	if (navigator.clipboard) {
		navigator.clipboard.writeText(text).then(() => {}, (err) => {
			console.error('Error copying text: ', err);
		});
	} else {
		var inputId = "copy-text-hidden-input";

		var input = document.createElement('input');
		input.setAttribute("id", inputId);
		input.setAttribute("class", "hidden");
		input.setAttribute("value", text);

		document.body.appendChild(input);

		// copy address
		document.getElementById(inputId).select();
		document.execCommand('copy');

		// remove element
		input.remove();
	}
}