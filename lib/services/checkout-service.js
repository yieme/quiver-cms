var ConfigService = require('../services/config-service'),
		Q = require('q'),
		_ = require('underscore'),
		moment = require('moment'),
		request = require('superagent'),
		FirebaseService = require('../services/firebase-service'),
		EmailService = require('../services/email-service'),
		Utility = require('../extensions/utility');
	

module.exports = {
	createTransaction: function (user, cart) {
		var transaction = {
				user: _.omit(user, ['private']),
				userId: user.public.id,
				userEmail: user.public.email,
				userName: user.public.name,
				transactionCount: user.transactions && user.transactions.length ? user.transactions.length + 1 : 1,
				items: [],
				date: moment().format()
			};

		transaction = _.extend(transaction, _.omit(cart, ['items', 'nonce']));

		_.each(cart.items, function (item) {
			item.key = item.$id;
			transaction.items.push(_.omit(item, ['active', 'isValid', 'description', 'featuredImage', 'images', 'optionGroups', 'optionsMatrix', '$id', '$priority']));
		});

		return Utility.async(transaction).fulfilled;
	},

	createSubscriptions: function (transaction) {
		var subscriptions = _.where(transaction.items, {type: 'subscription'});

		transaction.subscriptions = [];

		_.each(subscriptions, function (subscription) {
			var i = subscription.quantity;

			while (i--) {
				transaction.subscriptions.push(_.omit(subscription, ['taxable']));
			}
		});

		return Utility.async(transaction).fulfilled;
	},

	createDiscounts: function (transaction) {
		var discounts = _.where(transaction.items, {type: 'gift'}),
			generateCode = function (salt, i) {
				var code = salt,
		    	possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

	    	while (i--) {
	    		code += possible.charAt(Math.floor(Math.random() * possible.length));
	    	}		        

		    return code;
			};

		transaction.discounts = [];

		_.each(discounts, function (discount) {
			var i = discount.quantity,
				newDiscount;

			discount.discounts = [];

			while (i--) { // Users can purchase multiple of each gift certificate, so generate as many discounts as required by discount.quantity
				newDiscount = {
					active: true,
					code: generateCode(transaction.transactionCount + transaction.userId, 6),
					created: moment().format(),
					expiration: moment().add(5, 'year').format(),
					minSubtotal: 0,
					type: 'value',
					useCount: 0,
					uses: 1,
					value: discount.discount,
					price: discount.price,
					priceAdjusted: discount.priceAdjusted,
					userId: transaction.userId,
					slug: discount.slug
				};

				transaction.discounts.push(newDiscount);
				discount.discounts.push(newDiscount)
			}
			
		});

		return Utility.async(transaction).fulfilled;
	},

	createShipments: function (transaction) {
		var shippedItems = _.where(transaction.items, {shipped: true}),
			totalCount = shippedItems.length,
			counter = 0,
			now = moment().format();


		transaction.shipments = _.map(shippedItems, function (item) {
			counter += 1;
			return {
				counter: counter,
				totalCount: totalCount,
				item: item,
				created: now,
				transaction: _.pick(transaction, ['user', 'address', 'internationalAllowed', 'subtotal', 'tax', 'taxable', 'taxPercentage', 'shipping', 'domesticShipping', 'internationalShipping'])
			}
		});

		return Utility.async(transaction).fulfilled;
	},

	createDownloads: function (transaction) {
		var downloads = _.where(transaction.items, {type: 'digital'}),
			resourcesRef = FirebaseService.getResources(),
			resourceDeferred = Q.defer(),
			promises = [];


		if (downloads && downloads.length) {
			transaction.downloads = [];
		}

		_.each(downloads, function (item) {

			var i = item.quantity;

			while (i--) {
				transaction.downloads.push(item);
			}
			
		});

		return Utility.async(transaction).fulfilled;
	},

	saveTransaction: function (transaction) {
		var deferred = Q.defer(),
			codesDeferred = Q.defer(),
			subscriptionsDeferred = Q.defer(),
			giftsDeferred = Q.defer(),
			shippingDeferred = Q.defer(),
			downloadsDeferred = Q.defer(),
			transactionDeferred = Q.defer(),
			promises = [codesDeferred.promise, subscriptionsDeferred.promise, giftsDeferred.promise, shippingDeferred.promise, downloadsDeferred.promise, transactionDeferred.promise],
			now = moment().format(),
			logsRef = FirebaseService.getLogs(),
			userRef = FirebaseService.getUser(transaction.userId);

		/*
		 * Increment useCount for any codes
		 * Save discount use to log
		 * Save subscriptions to user 
		 * Save subscriptions to log
		 * Save gift discounts to user
		 * Save gift discounts
		 * Save shipments to user
		 * Save shipments to log
		 * Save downloads to user
		 * Save downloads
		 * Save transaction
		 *
		 *
		 *
		 */

		/*
		 * Increment code useCounts and log to logs.discounts
		 */
		var codePromises = [];
		_.each(transaction.codes, function (code) { // Increment code useCounts and log the use
			var useCountRef = FirebaseService.getDiscounts().child(code.key).child('useCount'),
				discountLogRef = logsRef.child('discounts').push(),
				codeDeferred = Q.defer();

			codePromises.push(codeDeferred.promise);

			useCountRef.once('value', function (snapshot) {
				var newUseCount = parseInt(snapshot.val()) + 1;

				useCountRef.set(newUseCount, function (err) {
					if (err) {
						codeDeferred.reject(err);
					} else {
		 			code.useCount = newUseCount;
		 			code.user = transaction.user;
		 			code.date = now;

		 			discountLogRef.set(code, function (err) {
		 				return err ? codeDeferred.reject(err) : codeDeferred.resolve();
		 			});	
					}
					
				});
			});
		});
		Q.all(codePromises).then(codesDeferred.resolve, codesDeferred.reject);


		/*
		 * Save subscription to user and log to logs.subscriptions
		 */
		var subscriptionPromises = [];
		_.each(transaction.subscriptions, function (subscription) {
			var subscriptionRef = userRef.child('private').child('commerce').child('subscriptions').push(),
				subscriptionLogRef = logsRef.child('subscriptions').push(),
				subscriptionDeferred = Q.defer();

			subscriptionPromises.push(subscriptionDeferred);

			delete subscription.$id;
			subscriptionRef.set(subscription, function (err) {
				if (err) {
					subscriptionDeferred.reject(err);
				} else {
		 		subscription.user = transaction.user;
		 		subscription.date = now;
		 		subscriptionLogRef.set(subscription, function (err) {
		 			return err ? subscriptionDeferred.reject(err) : subscriptionDeferred.resolve();
		 		});	

				}

			});

		});
		Q.all(subscriptionPromises).then(subscriptionsDeferred.resolve, subscriptionsDeferred.reject);

		/*
		 * Save gift discounts array and then save gift to user
		 */
		var discountPromises = [];
		_.each(transaction.discounts, function (discount) {
			var giftRef = userRef.child('private').child('commerce').child('gifts').push(),
				discountRef = FirebaseService.getDiscounts().push(),
				discountDeferred = Q.defer();

			discountPromises.push(discountDeferred);

			discountRef.set(discount, function (err) {
				if (err) {
					discountDeferred.reject(err);
				} else {
					discount.key = discountRef.key();
					giftRef.set(discount, function (err) {
						return err ? discountDeferred.reject : discountDeferred.resolve();
					});
				}

			});

		});
		Q.all(discountPromises).then(giftsDeferred.resolve, giftsDeferred.reject);

		/*
		 * Save shipments to user and log to logs.shipments
		 */
		var shipmentPromises = [];
		_.each(transaction.shipments, function (shipment) {
			var shipmentRef = userRef.child('private').child('commerce').child('shipments').push(),
				shipmentLogRef = logsRef.child('shipments').push(),
				shipmentDeferred = Q.defer();

			shipmentPromises.push(shipmentDeferred);

			shipmentRef.set(shipment, function (err) {
				if (err) {
					shipmentDeferred.reject(err);
				} else {
					shipmentLogRef.set(shipment, function (err) {
						return err ? shipmentDeferred.reject(err) : shipmentDeferred.resolve();
					});
				}
			});
			
		});
		Q.all(shipmentPromises).then(shippingDeferred.resolve, shippingDeferred.reject);

		/*
		 * Save downloads to user and to resources
		 */
		var downloadPromises = [];
		_.each(transaction.downloads, function (download) {
			var downloadRef = userRef.child('private').child('commerce').child('downloads').push(),
				resourceRef = FirebaseService.getResources().push(),
				downloadDeferred = Q.defer(),
				resource = {
					uri: download.downloadUri || false,
					date: now,
					key: resourceRef.key()
				};

				downloadPromises.push(downloadDeferred);

				download.resource = resource;
				downloadRef.set(download, function (err) {
					if (err) {
						downloadDeferred.reject(err);
					} else {
						resource.user = transaction.user;
						resourceRef.set(resource, function (err) {
							return err ? downloadDeferred.reject(err) : downloadDeferred.resolve();
						});

					}
				});
		});
		Q.all(downloadPromises).then(downloadsDeferred.resolve, downloadsDeferred.reject);

		/*
		 * Save transaction
		 */
		var transactionRef = userRef.child('private').child('commerce').child('transactions').push(),
			transactionLogRef = logsRef.child('transactions').push(),
			cleanedTransaction = _.omit(transaction, ['discounts', 'downloads', 'shipments', 'subscriptions', 'user']);

		transaction.keys = {
			user: transactionRef.key(),
			log: transactionLogRef.key()
		};

		transactionRef.set(cleanedTransaction, function (err) {
			if (err) {
				transactionDeferred.reject(err);
			} else {
				transactionLogRef.set(cleanedTransaction, function (err) {
					return err ? transactionDeferred.reject(err) : transactionDeferred.resolve(transaction);
				});
			}
		});


		// codesDeferred.promise.then(function () {
		// 	console.log('codes saved');
		// }, function (err) {
		// 	console.log('codes err', err);
		// });

		// subscriptionsDeferred.promise.then(function () {
		// 	console.log('subscriptions saved');
		// }, function (err) {
		// 	console.log('subscriptions err', err);
		// });

		// giftsDeferred.promise.then(function () {
		// 	console.log('gifts saved');
		// }, function (err) {
		// 	console.log('gifts err', err);
		// });

		// shippingDeferred.promise.then(function () {
		// 	console.log('shipping saved');
		// }, function (err) {
		// 	console.log('shipping err', err);
		// });

		// downloadsDeferred.promise.then(function () {
		// 	console.log('downloads saved');
		// }, function (err) {
		// 	console.log('downloads err', err);
		// });

		// transactionDeferred.promise.then(function () {
		// 	console.log('transaction saved');
		// }, function (err) {
		// 	console.log('transaction err', err);
		// });

		// console.log('******************************************');
		// console.log(transaction);
		Q.all(promises).then(function () {
			deferred.resolve(transaction);
		}, deferred.reject);

		return deferred.promise;
	},

	sendTransactionEmail: function (transaction) {
		var deferred = Q.defer(),
			textDeferred = Q.defer(),
			htmlDeferred = Q.defer(),
			key = transaction.keys.log;

		request.get(ConfigService.get('public.root') + '/transaction/' + key + '/email/text').end(function (err, res) {
      return err ? textDeferred.reject(err) : textDeferred.resolve(res.text);
    });

    request.get(ConfigService.get('public.root') + '/transaction/' + key + '/email/html').end(function (err, res) {
    	var content = res.text;
      return err ? htmlDeferred.reject(err) : htmlDeferred.resolve(content);
    });

    Q.all([textDeferred.promise, htmlDeferred.promise]).spread(function (text, html) {
    	var config = ConfigService.get('private.email'),
    		context = {
	    		text: text,
	    		html: html,
	    		to: [{
	    			"email": transaction.userEmail,
	    			"name": transaction.userName,
	    			"type": "to"
	    		}],
	    		tags: ['transaction-success'],
	    		subject: config.subjects.transaction
	    	};

	    	EmailService.sendEmail(context, function (err, result) {
	    		if (err) {
	    			deferred.reject(err);
	    		} else {
	    			transaction.email = result;
	    			FirebaseService.getTransaction(transaction.keys.log).child('email').push().set(result, function (err) {
	    				return err ? deferred.reject(err) : deferred.resolve(transaction);
	    			});
	    		}
	    		
	    	});
    });

		return deferred.promise;
	}
};