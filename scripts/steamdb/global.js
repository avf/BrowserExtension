'use strict';

const element = document.getElementById( 'steamdb-extension-protip' );

if( element )
{
	element.setAttribute( 'hidden', true );
}

window.addEventListener( 'message', ( request ) =>
{
	if( !request || !request.data || request.origin !== window.location.origin )
	{
		return;
	}

	switch( request.data.type )
	{
		case 'steamdb:extension-query':
		{
			if( request.data.contentScriptQuery )
			{
				SendMessageToBackgroundScript( request.data, ( response ) =>
				{
					window.postMessage( {
						type: 'steamdb:extension-response',
						request: request.data,
						response: response,
					}, GetHomepage() );
				} );
			}
			break;
		}
		case 'steamdb:extension-invalidate-cache':
		{
			WriteLog( 'Invalidating userdata cache' );
			SendMessageToBackgroundScript( {
				contentScriptQuery: 'InvalidateCache',
			}, () =>
			{
				// noop
			} );
			break;
		}
	}
} );

var myObserver;

GetOption( { 'steamdb-highlight': true }, function( items )
{
	if( !items[ 'steamdb-highlight' ] )
	{
		return;
	}

	const OnDataLoaded = function( data )
	{
		
		const ignoredItemIds = [];
		for (var key in data.rgIgnoredApps) {
			ignoredItemIds.push(key);
		}
		// console.log("FOOO data was loaded", data);
		// console.log(ignoredItemIds);

		if (!myObserver) {
			const callback = () => {
				var allInstantSearchItems = document.querySelectorAll(".ais-Hits-item");
				// console.log(allInstantSearchItems);
				for (var instantSearchItem of allInstantSearchItems) {
					const aTag = instantSearchItem.children[0];
					// console.log("aTag: ", aTag);
					const url = aTag.getAttribute("href");
					const splitUrl = url.split("/");
					const itemID = splitUrl[splitUrl.length - 2];
					// console.log("url: ", url);
					// console.log("splitUrl: ", splitUrl);
					// console.log("itemID: ", itemID);
					if (ignoredItemIds.includes(itemID)) {
						console.log("removed: ", url, itemID);
						instantSearchItem.remove();
						// instantSearchItem.style.outline = '#f00 solid 2px';
					}
				}	
			};

			myObserver = new MutationObserver(callback);
			const config = { attributes: true, childList: true, subtree: true };
			myObserver.observe(document, config);	
		}


		window.postMessage( {
			type: 'steamdb:extension-loaded',
			data: data,
		}, GetHomepage() );
	};

	SendMessageToBackgroundScript( {
		contentScriptQuery: 'FetchSteamUserData',
	}, ( response ) =>
	{
		if( response.error )
		{
			WriteLog( 'Failed to load userdata', response.error );

			const warning = document.createElement( 'div' );
			warning.className = 'extension-warning';

			warning.appendChild( document.createTextNode( 'Failed to load game data from Steam.' ) );
			warning.appendChild( document.createElement( 'br' ) );
			warning.appendChild( document.createTextNode( response.error ) );

			const btn = document.createElement( 'a' );
			btn.className = 'btn btn-sm btn-primary';
			btn.href = 'https://store.steampowered.com/login/';
			btn.textContent = 'Sign in on the Steam Store';

			const btnDiv = document.createElement( 'div' );
			btnDiv.appendChild( btn );
			warning.appendChild( btnDiv );
			document.body.appendChild( warning );
		}

		if( response.data )
		{
			OnDataLoaded( response.data );

			WriteLog( 'Userdata loaded', `Packages: ${response.data.rgOwnedPackages.length}` );
		}
	} );
} );
