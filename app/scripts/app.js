'use strict';

ConTroll.setConvention('M2UyZjJlNzE2M2RkYmVkZWZiYjkzZDRiZGJmOGVlNzM1YjBlN2ZkNQ');
ConTroll.ifAuth(function(){
	ConTroll.getUserEmail(function(email){
		console.log("User authenticated as " + email);
	})
});

(function(document) {
	
	var Catalog = function(catalogName) {
		this.catalog = catalogName;
		this.callbacks = [];
		this.content = null;
	};
	
	Catalog.prototype.get = function(callback) {
		if (this.content) {
			// locally cache content in case we get an invalidation before we can delivery
			var localContent = this.content;
			window.setTimeout(function(){ callback(localContent); },0);
			return;
		}
		
		if (this.callbacks.length > 0) { // already someone waiting, lets wait as well
			this.callbacks.push(callback);
			return;
		}
		
		this.callbacks.push(callback);
		if (!ConTroll[this.catalog])
			throw new Error("Catalog " + this.catalog + " is not supported!");
		ConTroll[this.catalog].catalog(this.handleCallback.bind(this));
	};
	
	Catalog.prototype.dejsonify = function(data) {
		if (data instanceof Array) {
			for (var i = 0; i < data.length; i++)
				data[i] = this.dejsonify(data[i]);
			return data;
		}
		
		if (typeof data == 'object') {
			for (var field in data) {
				var value = this.dejsonify(data[field])
				if (field.match(/-/)) {
					data[field.replace(/-/g,'_')] = value;
					delete data[field];
				} else {
					data[field] = value;
				}
			}
			return data;
		}
		
		if (typeof data == 'string' && data.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2}$/))
			// we love ISO-8601
			return moment(data).toDate();
		
		return data;
	};
	
	Catalog.prototype.handleCallback = function(content) {
		this.content = content;
		this.callbacks.forEach(function(callback){
			callback(content);
		});
		this.callbacks = [];
	}
	
	Catalog.prototype.invalidate = function() {
		this.content = null;
		this.callbacks = [];
	};
	
	var app = document.querySelector('#app');
	app.baseUrl = '/';
	// Listen for template bound event to know when bindings
	// have resolved and content has been stamped to the page
	app.addEventListener('dom-change', function() {
		console.log('Our app is ready to rock!');
		this.set('cart',[]);
		this.set('cartTotal', 0);
	});

	window.addEventListener('WebComponentsReady', function() {// See https://github.com/Polymer/polymer/issues/1381
		// imports are loaded and elements have been registered
	});

	/*
	 * Main area's paper-scroll-header-panel custom condensing transformation of
	 * the appName in the middle-container and the bottom title in the bottom-container.
	 * The appName is moved to top and shrunk on condensing. The bottom sub-title is shrunk to nothing on condensing.
	 */
	window.addEventListener('paper-header-transform', function(e) {
	    var appName = Polymer.dom(document).querySelector('#mainToolbar .app-name');
	    var middleContainer = Polymer.dom(document).querySelector('#mainToolbar .middle-container');
	    // var bottomContainer = Polymer.dom(document).querySelector('#mainToolbar
		// .bottom-container');
	    var detail = e.detail;
	    var heightDiff = detail.height - detail.condensedHeight;
	    var yRatio = Math.min(1, detail.y / heightDiff);
	    // appName max size when condensed. The smaller the number the smaller the
		// condensed size.
	    var maxMiddleScale = 0.50;
	    var auxHeight = heightDiff - detail.y;
	    var auxScale = heightDiff / (1 - maxMiddleScale);
	    var scaleMiddle = Math.max(maxMiddleScale, auxHeight / auxScale + maxMiddleScale);
	    var scaleBottom = 1 - yRatio;
	
	    // Move/translate middleContainer
	    Polymer.Base.transform('translate3d(0,' + yRatio * 100 + '%,0)', middleContainer);
	    
	    // Scale bottomContainer and bottom sub title to nothing and back
	    // Polymer.Base.transform('scale(' + scaleBottom + ') translateZ(0)',
		// bottomContainer);
	
	    // Scale middleContainer appName
	    Polymer.Base.transform('scale(' + scaleMiddle + ') translateZ(0)', appName);
	});
	
	// Scroll page to top and expand header
	app.scrollPageToTop = function() {
		app.$.headerPanelMain.scrollToTop(true);
	};
	
	app.closeDrawer = function() {
		app.$.paperDrawerPanel.closeDrawer();
	};
	
	app.sendRefreshEvent = function() {
	  console.log("Refreshing from server");
	  // first invalidate catalog caches
	  for (var catalog in app.controllCatalogs)
		  app.controllCatalogs[catalog].invalidate();
	  app.fire('please-refresh-lists');
	  app.fire('cart-updated');
	};
	
	app.controllCatalogs = {};
	app.getCatalog = function(catalog, callback) {
		if (!this.controllCatalogs[catalog]) this.controllCatalogs[catalog] = new Catalog(catalog);
		this.controllCatalogs[catalog].get(callback);
	};
	app.invalidateCatalog = function(catalog) {
		app.controllCatalogs[catalog].invalidate();
	};
	
	app.dejsonify = Catalog.prototype.dejsonify; // expose to other modules
	
	app.timeslot_rounds = {
	                            'ראשון בוקר'	: [ moment("2016-04-24 09:00"), moment("2016-04-24 14:00")],
	                            'ראשון צהריים'	: [ moment("2016-04-24 14:00"), moment("2016-04-24 19:00")],
	                            'ראשון ערב'	: [ moment("2016-04-24 20:00"), moment("2016-04-25 01:00")],
	                            'שני בוקר'	: [ moment("2016-04-25 09:00"), moment("2016-04-25 14:00")],
	                            'שני צהריים'	: [ moment("2016-04-25 14:00"), moment("2016-04-25 18:00")],
	                            'שני ערב' 	: [ moment("2016-04-25 19:00"), moment("2016-04-26 01:00")],
	};
	
	app.getRound = function(time) {
		var m = moment(time);
		for (var round in this.timeslot_rounds) {
			if (m.isSame(this.timeslot_rounds[round][0]) || m.isBetween(this.timeslot_rounds[round][0], this.timeslot_rounds[round][1]))
				return round;
		}
		return null;
	};
	
	app.addToCart = function(timeslot, callback) {
		var user = this.$.cashier.user;
		// check that we don't already have this in the cart
		var i = this.cart.findIndex(function(t){ return t.status == 'reserved' && t.timeslot.id == timeslot.id; });
		if (i < 0) {
			ConTroll.tickets.addToCart(timeslot.id, user.id, (function(ticket){
				this.updateCart({ detail: {ticket: ticket} });
				if (callback) callback(ticket);
			}).bind(this));
		} else {
			this.updateCartAmount(this.cart[i].id, parseInt(this.cart[i].amount) + 1, callback);
		}
	};
	
	app.updateCart = function(event) {
		if (event.detail.user) {
			this.$.cashier.user = event.detail.user;
		}
		if (this.$.cashier.user)
			ConTroll.tickets.forUser(this.$.cashier.user.id, (function(tickets){
				this.set('cart', tickets);
			}).bind(this));
		else
			this.set('cart',[]);
		app.fire('cart-updated');
	};
	
	app.updateCartAmount = function(ticketid, amount, callback) {
		ConTroll.tickets.updateCart(ticketid,amount,(function(ticket){
			var i = this.cart.findIndex(function(t){ return t.id == ticket.id; });
			this.cart[i].timeslot.available_tickets = ticket.timeslot.available_tickets; // populate property calculated on the server
			if (amount < 1)
				this.splice('cart',i,1);
			else
				this.set('cart.' + i + '.amount', ticket.amount);
			if (callback) callback(ticket);
			app.fire('cart-updated');
		}).bind(this));
	};
	
	app.logout = function() {
		ConTroll.logout('/');
	};
	
	app.addEventListener('user-profile-changed', app.updateCart.bind(app), false);
})(document);
