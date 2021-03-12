let runtimeObj;
let storeSessionId;

if( typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined' )
{
	runtimeObj = chrome.runtime;
}
else
{
	runtimeObj = browser.runtime;
}

runtimeObj.onInstalled.addListener( ( event ) =>
{
	if( event.reason === 'install' && runtimeObj.openOptionsPage )
	{
		runtimeObj.openOptionsPage();
	}
} );

runtimeObj.onMessage.addListener( ( request, sender, callback ) =>
{
	if( !Object.hasOwnProperty.call( request, 'contentScriptQuery' ) )
	{
		return false;
	}

	switch( request.contentScriptQuery )
	{
		case 'InvalidateCache': InvalidateCache(); callback(); return true;
		case 'FetchSteamUserData': FetchSteamUserData( callback ); return true;
		case 'GetCurrentPlayers': GetCurrentPlayers( request.appid, callback ); return true;
		case 'GetPrice': GetPrice( request, callback ); return true;
		case 'StoreWishlistAdd': StoreWishlistAdd( request.appid, callback ); return true;
		case 'StoreWishlistRemove': StoreWishlistRemove( request.appid, callback ); return true;
		case 'StoreFollow': StoreFollow( request.appid, callback ); return true;
		case 'StoreUnfollow': StoreUnfollow( request.appid, callback ); return true;
		case 'StoreIgnore': StoreIgnore( request.appid, callback ); return true;
		case 'StoreUnignore': StoreUnignore( request.appid, callback ); return true;
		case 'StoreAddToCart': StoreAddToCart( request, callback ); return true;
		case 'StoreAddFreeLicense': StoreAddFreeLicense( request, callback ); return true;
	}

	return false;
} );

function IsIncognito()
{
	if( typeof chrome !== 'undefined' && typeof chrome.extension !== 'undefined' )
	{
		return chrome.extension.inIncognitoContext;
	}

	return browser.extension.inIncognitoContext;
}

function InvalidateCache()
{
	const keyCache = IsIncognito() ? 'incognito.userdata.cached' : 'userdata.cached';
	SetOption( keyCache, Date.now() );
}

function FetchSteamUserData( callback )
{
	const incognito = IsIncognito();
	const keyCache = incognito ? 'incognito.userdata.cached' : 'userdata.cached';
	const keyStore = incognito ? 'incognito.userdata.stored' : 'userdata.stored';

	GetOption( { keyCache: Date.now() }, ( data ) =>
	{
		const now = Date.now();
		let cache = data[ keyCache ];

		if( now > cache + 3600000 )
		{
			SetOption( keyCache, now );
			cache = now;
		}

		fetch( `https://store.steampowered.com/dynamicstore/userdata/?_=${encodeURIComponent( cache )}`,
			{
				credentials: 'include',
				cache: 'force-cache',
			} )
			.then( ( response ) => response.json() )
			.then( ( response ) =>
			{
				if( !response || !response.rgOwnedPackages || !response.rgOwnedPackages.length )
				{
					throw new Error( 'Are you logged on the Steam Store?' );
				}

				// Only keep the data we actually need
				const data =
				{
					rgOwnedPackages: response.rgOwnedPackages || [],
					rgOwnedApps: response.rgOwnedApps || [],

					rgPackagesInCart: response.rgPackagesInCart || [],
					rgAppsInCart: response.rgAppsInCart || [],

					rgIgnoredApps: response.rgIgnoredApps || {},
					rgIgnoredPackages: response.rgIgnoredPackages || {},

					rgFollowedApps: response.rgFollowedApps || [],
					rgWishlist: response.rgWishlist || [],
				};

				callback( { data: data } );

				SetOption( keyStore, JSON.stringify( data ) );
			} )
			.catch( ( error ) =>
			{
				InvalidateCache();

				GetOption( { keyStore: false }, function( data )
				{
					const response =
					{
						error: error.message,
					};

					if( data[ keyStore ] )
					{
						response.data = JSON.parse( data[ keyStore ] );
					}

					callback( response );
				} );
			} );
	} );
}

function GetCurrentPlayers( appid, callback )
{
	fetch( `https://steamdb.info/api/GetCurrentPlayers/?appid=${parseInt( appid, 10 )}`, {
		credentials: 'omit',
	} )
		.then( ( response ) => response.json() )
		.then( callback )
		.catch( ( error ) => callback( { success: false, error: error.message } ) );
}

function GetPrice( request, callback )
{
	let url = `https://steamdb.info/api/ExtensionGetPrice/?appid=${parseInt( request.appid, 10 )}&currency=${encodeURIComponent( request.currency )}`;

	if( request.country )
	{
		url += `&country=${encodeURIComponent( request.country )}`;
	}

	fetch( url, {
		credentials: 'omit',
	} )
		.then( ( response ) => response.json() )
		.then( callback )
		.catch( ( error ) => callback( { success: false, error: error.message } ) );
}

function StoreWishlistAdd( appid, callback )
{
	const formData = new FormData();
	formData.set( 'appid', parseInt( appid, 10 ) );
	ExecuteStoreApiCall( 'api/addtowishlist', formData, callback );
}

function StoreWishlistRemove( appid, callback )
{
	const formData = new FormData();
	formData.set( 'appid', parseInt( appid, 10 ) );
	ExecuteStoreApiCall( 'api/removefromwishlist', formData, callback );
}

function StoreFollow( appid, callback )
{
	const formData = new FormData();
	formData.set( 'appid', parseInt( appid, 10 ) );
	ExecuteStoreApiCall( 'explore/followgame/', formData, callback );
}

function StoreUnfollow( appid, callback )
{
	const formData = new FormData();
	formData.set( 'appid', parseInt( appid, 10 ) );
	formData.set( 'unfollow', 1 );
	ExecuteStoreApiCall( 'explore/followgame/', formData, callback );
}

function StoreIgnore( appid, callback )
{
	const formData = new FormData();
	formData.set( 'appid', parseInt( appid, 10 ) );
	formData.set( 'ignore_reason', 0 );
	ExecuteStoreApiCall( 'recommended/ignorerecommendation/', formData, callback );
}

function StoreUnignore( appid, callback )
{
	const formData = new FormData();
	formData.set( 'appid', parseInt( appid, 10 ) );
	formData.set( 'remove', 1 );
	ExecuteStoreApiCall( 'recommended/ignorerecommendation/', formData, callback );
}

function StoreAddToCart( request, callback )
{
	const formData = new FormData();
	formData.set( 'action', 'add_to_cart' );

	if( request.subid )
	{
		formData.set( 'subid', parseInt( request.subid, 10 ) );
	}
	else if( request.bundleid )
	{
		formData.set( 'bundleid', parseInt( request.bundleid, 10 ) );
	}
	else
	{
		return;
	}

	ExecuteStoreApiCall( 'cart/addtocart', formData, callback );
}

function StoreAddFreeLicense( request, callback )
{
	const freeLicenseResponse = ( response ) =>
	{
		if( Array.isArray( response ) )
		{
			// This api returns [] on success
			callback( { success: true } );

			InvalidateCache();

			return;
		}

		const resultCode = response?.purchaseresultdetail ?? null;
		let message;

		switch( resultCode )
		{
			case 9: message = 'This product is already available in your Steam library.'; break;
			case 53: message = 'You got rate limited, try again in an hour.'; break;
			default: message = resultCode === null
				? 'There was a problem adding this product to your account.'
				: `There was a problem adding this product to your account. PurchaseResultDetail=${resultCode}`;
		}

		callback( {
			success: false,
			error: message,
		} );
	};

	if( request.subid )
	{
		const subid = parseInt( request.subid, 10 );
		const formData = new FormData();
		formData.set( 'ajax', 'true' );

		ExecuteStoreApiCall( `checkout/addfreelicense/${subid}`, formData, freeLicenseResponse, true );
	}
	else if( request.bundleid )
	{
		const bundleid = parseInt( request.bundleid, 10 );
		const formData = new FormData();
		formData.set( 'ajax', 'true' );

		ExecuteStoreApiCall( `checkout/addfreebundle/${bundleid}`, formData, freeLicenseResponse, true );
	}
}

function ExecuteStoreApiCall( path, formData, callback, rawCallback = false )
{
	GetStoreSessionID( ( session ) =>
	{
		if( !session.success )
		{
			callback( session );
			return;
		}

		formData.set( 'sessionid', session.sessionID );

		fetch( `https://store.steampowered.com/${path}`, {
			credentials: 'include',
			method: 'POST',
			body: formData,
		} )
			.then( ( response ) => response.json() )
			.then( ( response ) =>
			{
				if( rawCallback )
				{
					callback( response );
					return;
				}

				if( path === 'explore/followgame/' )
				{
					// This API returns just true/false instead of an object
					response = {
						success: response === true,
					};
				}

				if( response && response.success )
				{
					callback( { success: true } );

					InvalidateCache();
				}
				else
				{
					callback( { success: false, error: 'Failed to do the action. Are you logged in on the Steam store?\nThis item may not be available in your country.' } );
				}
			} )
			.catch( ( error ) => callback( { success: false, error: error.message } ) );
	} );
}

function GetStoreSessionID( callback )
{
	if( storeSessionId )
	{
		callback( { success: true, sessionID: storeSessionId } );
		return;
	}

	fetch( 'https://store.steampowered.com/account/preferences', {
		credentials: 'include',
	} )
		.then( ( response ) => response.text() )
		.then( ( response ) =>
		{
			const session = response.match( /g_sessionID = "(\w+)";/ );

			if( session && session[ 1 ] )
			{
				storeSessionId = session[ 1 ];

				callback( { success: true, sessionID: storeSessionId } );
			}
			else
			{
				callback( {
					success: false,
					error: response.includes( 'login' )
						? 'Failed to failed sessionid. It does not look like you are logged in to the Steam store.'
						: 'Failed to failed sessionid. Something went horribly wrong, you should report this issue.',
				} );
			}
		} )
		.catch( ( error ) => callback( { success: false, error: error.message } ) );
}

function GetOption( items, callback )
{
	if( typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined' )
	{
		chrome.storage.local.get( items, callback );
	}
	else if( typeof browser !== 'undefined' )
	{
		browser.storage.local.get( items ).then( callback );
	}
}

function SetOption( option, value )
{
	const chromepls = {}; chromepls[ option ] = value;

	if( typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined' )
	{
		chrome.storage.local.set( chromepls );
	}
	else if( typeof browser !== 'undefined' )
	{
		browser.storage.local.set( chromepls );
	}
}
