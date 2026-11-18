/* Runs before the page paints: applies the saved colour theme and hides the pre-built home page when another page is opened. */
(function(){var d=document.documentElement;try{var t=localStorage.getItem('dealpin.site.theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t)}catch(e){}
var h=location.hash;if(h&&h!=='#'&&h!=='#/')d.className+=' nopre'})();
