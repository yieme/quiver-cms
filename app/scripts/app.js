'use strict';

angular.module('quiverCmsApp', [
  'ngSanitize',
  'ui.router',
  'firebase',
  'angular-markdown-editable',
  'slugifier',
  'restangular',
  'quiver.angular-utilities',
  'quiver.angularfire-authentication',
  'angular-md5',
  'ngStorage',
  'flow',
  'angular-google-analytics',
  'wu.packery',
  'ngMaterial'
]).run(function ($rootScope, $state, Restangular, NotificationService, env, Analytics, qvAuth, AdminService, $localStorage, $timeout) {
    var stateChangeSuccessOff,
    handleStateChangeSuccess = function () {
      $timeout(function () {
        var config;
        if ($localStorage.userId) {
          config = {userId: $localStorage.userId};
        }
        
        Analytics.createAnalyticsScriptTag(config);
        stateChangeSuccessOff();
      });
      
    };
    
    stateChangeSuccessOff = $rootScope.$on('$stateChangeSuccess', handleStateChangeSuccess);

    $rootScope.$on('$stateChangeStart', function (e, toState, toParams, fromState, fromParams) {
      $state.previous = _.clone($state);
      $state.toState = toState;
      $state.toParams = toParams;
      $state.fromState = fromState;
      $state.fromParams = fromParams;      
    });

    $rootScope.$on('$stateChangeSuccess', function (e, toState, toParams, fromState, fromParams) {
      $timeout(function () {
        $rootScope.$emit('$stateChangeRender');
      });
      
    });
     
    qvAuth.auth.$onAuth(function (authData) {

      if (authData && authData.uid) {       
        // Make sure that the user has been created and redirect if needed
        AdminService.getApiUser(qvAuth.getHeaders(authData)).then(function () {
          if (~AdminService.loggedOutStates.indexOf($state.toState.name)) {
            AdminService.redirect();
          }
          
        }); 

      }

    });

    Restangular.one('env').get().then(function (res) {}, function (error) {
      NotificationService.error('Server Unresponsive', 'The server could not be reached at ' + env.api + '. Try reloading the page or come back later.');
    });

}).config(function ($locationProvider, $stateProvider, $urlRouterProvider, AngularFireAuthenticationProvider, quiverUtilitiesProvider, RestangularProvider, flowFactoryProvider, AnalyticsProvider, $mdThemingProvider) {
    /*
     * HTML5 Mode
    */
    if (window.envVars.html5Mode) {
      $locationProvider.html5Mode(true).hashPrefix('!');
    }

    /*
     * Configure Restangular
    */
    RestangularProvider.setBaseUrl(window.envVars.api);

    /*
     * Configure Notifications
    */
    quiverUtilitiesProvider.setNotificationConfig(window.envVars.notification);

    /*
     * Configure Environment
    */
    quiverUtilitiesProvider.setEnv(window.envVars);

    /*
     * Configure qvAuth
     */
    AngularFireAuthenticationProvider.setEndpoint(window.envVars.firebase.endpoint);

    /*
     * Configure Default Route
    */
    $urlRouterProvider.otherwise('/app/');

    /*
     * Analytics
    */
    if (window.envVars.google && window.envVars.google.analyticsId) {
      AnalyticsProvider.setAccount(window.envVars.google.analyticsId);
      AnalyticsProvider.trackPages(true);
      AnalyticsProvider.useAnalytics(true);
      AnalyticsProvider.ignoreFirstPageLoad(false);
      AnalyticsProvider.useECommerce(true, true);
      AnalyticsProvider.setPageEvent('$stateChangeSuccess');
      AnalyticsProvider.delayScriptTag(true);
      AnalyticsProvider.useEnhancedLinkAttribution(true);
    }

    /*
     * Angular Material
     */
    _.each(window.envVars.themes, function (theme) {
      $mdThemingProvider.theme(theme.name).primaryPalette(theme.primaryPalette.name, theme.primaryPalette.options).accentPalette(theme.accentPalette.name, theme.accentPalette.options);  
    });


    /*
     * Configure states
    */

    $stateProvider
      /*
       * Non-auth routes
      */
      .state('master', {
      url: '/app',
        abstract: true,
        templateUrl: 'views/master.html',
        controller: 'MasterCtrl',
        resolve: {
          currentUser: function (qvAuth) {
            return qvAuth.getCurrentUser();
          },
          settings: function ($q, AdminService) {
            return AdminService.getSettings().$loaded();
          },
          files: function (AdminService) {
            return AdminService.getFiles();
          },
          user: function ($q, $state, qvAuth, AdminService) {
            /*
             * The user may be logged in, but hit the page without auth,
             * so currentUser was not resolved on the initial page load.
            */
            return qvAuth.getCurrentUser().then(function (currentUser) {
              if (!currentUser || !currentUser.uid) {
                return qvAuth.getResolvedPromise();
              }

              var headers = qvAuth.getHeaders(currentUser);

              RestangularProvider.setDefaultHeaders(headers);
              flowFactoryProvider.defaults = {headers: headers, testChunks: false};

              return AdminService.getApiUser(headers);

            }).then(function (data) {
              return !data ? qvAuth.getResolvedPromise() : qvAuth.getUser(data.key);
            });

          }
        }
      })
      .state('master.nav', {
        abstract: true,
        views: {
          sidenavLeft: {
            templateUrl: 'views/sidenav-left.html'
          },
          body: {
            templateUrl: 'views/body.html'
          },
          footer: {
            templateUrl: 'views/footer.html'
          }
        }
      })
      .state('master.nav.login', {
        url: '/login',
        templateUrl: 'views/login.html',
        controller: 'AuthCtrl'
      })
      .state('master.nav.register', {
        url: '/register',
        templateUrl: 'views/register.html',
        controller: 'AuthCtrl'
      })
      .state('master.nav.reset', {
        url: '/reset',
        templateUrl: 'views/reset.html',
        controller: 'AuthCtrl'
      })
      .state('master.nav.cart', {
        url: '/cart',
        templateUrl: 'views/cart.html',
        controller: 'CartCtrl',
        resolve: {
          products: function (AdminService, $q) {
            return AdminService.getProducts().$loaded();
          },
          countriesStatus: function (AdminService, $q) {
            return AdminService.getCountries().$loaded();
          },
          statesStatus: function (AdminService, $q) {
            return AdminService.getStates().$loaded();
          },
          shipping: function (AdminService) {
            return AdminService.getShipping();
          },
          clientToken: function () {
            return false;
          }
        }
      })

      /*
       * Authenticated routes
      */
      .state('authenticated', { // *************************************************  Authentication  ******************
        abstract: true,
        templateUrl: 'views/authenticated.html',
        controller: 'AuthenticatedCtrl',
        resolve: {
          user: function ($q, $state, qvAuth, $localStorage, AdminService) {
            return qvAuth.getCurrentUser().then(function (currentUser) {
              if (!currentUser || !currentUser.uid) {
                // Dump users without auth to login.
                $localStorage.redirect = {
                  toState: $state.toState,
                  toParams: $state.toParams
                };
                return $state.go('master.nav.login');
              }

              var headers = qvAuth.getHeaders(currentUser);

              RestangularProvider.setDefaultHeaders(headers);
              flowFactoryProvider.defaults = {headers: headers, testChunks: false};

              return AdminService.getApiUser(headers);

            }).then(function (data) {
              return data && data.key ? qvAuth.getUser(data.key) : qvAuth.getRejectedPromise();
            });

          }
        }
      })
      .state('authenticated.master', {
        url: '/app',
        abstract: true,
        templateUrl: 'views/master.html',
        controller: 'MasterCtrl',
        resolve: {
          currentUser: function (qvAuth) {
            return qvAuth.getCurrentUser();
          },
          settings: function (AdminService) {
            return AdminService.getSettings().$loaded();
          },
          files: function (AdminService) {
            console.warn('Rework files system... these files should not be queried in authenticated.master');
            return AdminService.getFiles();
          }
        }
      })
      .state('authenticated.master.nav', {
        abstract: true,
        views: {
          sidenavLeft: {
            templateUrl: 'views/sidenav-left.html',
            controller: 'NavCtrl',
            resolve: {
              subscriptions: function (UserService, user) {
                return UserService.getSubscriptions(user.$id);
              }
            }
          },
          body: {
            templateUrl: 'views/body.html'
          },
          footer: {
            templateUrl: 'views/footer.html'
          }
        }
      })
      .state('authenticated.master.nav.dashboard', {
        url: '/',
        templateUrl: 'views/dashboard.html',
        controller: 'DashboardCtrl',
        resolve: {
          limit: function () {
            return 5;
          },
          assignments: function (UserService, user, limit) {
            return UserService.getSubmittedAssignments(user.$id, {orderByPriority: true, limitToLast: limit}).$loaded();
          },
          subscriptions: function (UserService, user) {
            return UserService.getSubscriptions(user.$id).$loaded();
          },
          shipments: function (UserService, user) {
            return UserService.getShipments(user.$id).$loaded();
          },
          gifts: function (UserService, user) {
            return UserService.getGifts(user.$id).$loaded();
          },
          downloads: function (UserService, user) {
            return UserService.getDownloads(user.$id).$loaded();
          },
          transactions: function (UserService, user) {
            return UserService.getTransactions(user.$id).$loaded();
          },
        }
      })
      .state('authenticated.master.nav.account', { // ******************************  Account **************************
        url: "/account",
        templateUrl: 'views/account.html',
        controller: 'AccountCtrl',
        resolve: {
          userPublic: function (UserService, user) {
            return UserService.getPublic(user.$id);
          }
        }
      })
      .state('authenticated.master.nav.checkout', { // *****************************  Checkout *************************
        url: "/checkout",
        templateUrl: 'views/checkout.html',
        controller: 'CartCtrl',
        resolve: {
          products: function (AdminService, $q) {
            return AdminService.getProducts().$loaded();
          },
          countriesStatus: function (AdminService, $q) {
            return AdminService.getCountries().$loaded();
          },
          statesStatus: function (AdminService, $q) {
            return AdminService.getStates().$loaded();
          },
          shipping: function (AdminService) {
            return AdminService.getShipping();
          },
          clientToken: function (CommerceService, user) {
            return CommerceService.getClientToken();
          }

        }
      })
      .state('authenticated.master.nav.transaction', { // **************************  Transaction **********************
        url: "/user/:userId/transaction/:key",
        templateUrl: 'views/transaction.html',
        controller: 'UserTransactionCtrl',
        resolve: {
          transaction: function (UserService, $stateParams, $state, qvAuth, user) {
            if (!qvAuth.verifyUser($stateParams.userId, user)) {
              $state.go('authenticated.master.nav.dashboard');

            } else {
              return  UserService.getTransaction($stateParams.userId, $stateParams.key);
            }
             
          }
        }
      })
      .state('authenticated.master.nav.messages', { // *****************************  Messages *************************
        abstract: true,
        templateUrl: 'views/messages.html',
        controller: 'MessagesCtrl',
        resolve: {
          messageable: function (AdminService, user) {
            if (user && user.private && user.private.isAdmin) {
              return AdminService.getUsers({orderByChild: 'email'});
            } else {
              return AdminService.getMessageable();  
            }
            
          },
          sentMessages: function (UserService, user) {
            return UserService.getSentMessages(user.$id);
          },
          receivedMessages: function (UserService, user) {
            return UserService.getReceivedMessages(user.$id);
          }
        }  
      })
      .state('authenticated.master.nav.messages.list', { // *****************************  Messages *************************
        url: '/messages',
        templateUrl: 'views/messages-list.html'
      })
      .state('authenticated.master.subscription', { // **********************************  Table of Contents ****************
        abstract: true,
        url: "/subscription/:subscriptionKey",
        views: {
          sidenavLeft: {
            templateUrl: 'views/sidenav-left.html',
            controller: 'NavCtrl',
            resolve: {
              subscriptions: function (UserService, user) {
                return UserService.getSubscriptions(user.$id);
              }
            }
          },
          sidenavRight: {
            templateUrl: 'views/sidenav-subscription.html',
            controller: 'UserSubscriptionCtrl',
            resolve: {
              subscription: function (UserService, user, $stateParams) {
                return UserService.getSubscription(user.public.id, $stateParams.subscriptionKey);
              },
              pages: function(user, UserService, $stateParams) {
                return UserService.getPages(user.public.id, $stateParams.subscriptionKey);
              },
              assignments: function (UserService, user, $stateParams) {
                return UserService.getAssignments(user.public.id, $stateParams.subscriptionKey);
              }
            }
          },
          body: {
            templateUrl: 'views/body.html'
          },
          footer: {
            templateUrl: 'views/footer.html'
          }
        }
      })
      .state('authenticated.master.subscription.page', { // *********************  User Subscription ****************
        url: "/page/:pageNumber",
        templateUrl: '/views/page.html',
        controller: 'PageCtrl',
        resolve: {
          isActive: function (UserService, user, $stateParams, $q, NotificationService, $state) {
            var deferred = $q.defer();

            UserService.getSubscription(user.public.id, $stateParams.subscriptionKey).$loaded()
              .then(function (subscription) {
                return UserService.subscriptionIsExpired(subscription, true);
              })
              .then(function (isExpired) {
                if (isExpired) {
                  NotificationService.notify('Subscription Expired');
                  return $state.go('authenticated.master.nav.dashboard');
                } else {
                  deferred.resolve(true);
                }
              });

            return deferred.promise;
            
          },
          word: function (AdminService, UserService, user, $stateParams, $localStorage, $rootScope) {
            return UserService.getPages(user.public.id, $stateParams.subscriptionKey).then(function (pages) {
              var key = pages[$stateParams.pageNumber].$id;

              $rootScope.assignmentKey = undefined;
              $rootScope.pageNumber = parseInt($stateParams.pageNumber);
              $localStorage['bookmark-' + $stateParams.subscriptionKey] = parseInt($stateParams.pageNumber);
              return AdminService.getWord(key);
              
            });
            
          }
        }
      })
      .state('authenticated.master.subscription.assignment', {
        url: "/assignment/:assignmentKey",
        templateUrl: '/views/assignment.html',
        controller: 'UserAssignmentCtrl',
        resolve: {
          assignment: function (AdminService, $stateParams, $localStorage, $rootScope) {

            $rootScope.pageNumber = undefined;
            $rootScope.assignmentKey = $stateParams.assignmentKey;
            $localStorage['assignment-' + $stateParams.assignmentKey] = $stateParams.assignmentKey;
            return AdminService.getAssignment($stateParams.assignmentKey);
          },
          userAssignment: function (UserService, user, $stateParams) {
            return UserService.getAssignment(user.public.id, $stateParams.assignmentKey);
          },
          userAssignmentUploads: function (UserService, user, $stateParams) {
            return UserService.getAssignmentUploads(user.public.id, $stateParams.assignmentKey);
          },
          userAssignmentMessages: function (UserService, user, $stateParams) {
            return UserService.getAssignmentMessages(user.public.id, $stateParams.assignmentKey);
          },
          notifications: function (AdminService, currentUser) {
            return AdminService.getNotifications(currentUser.uid);
          }
        }
      })
      /*
       * Admin routes
      */
      .state('authenticated.master.admin', { // ************************************  Admin ****************************
        url: '/admin',
        views: {
          sidenavLeft: {
            templateUrl: 'views/sidenav-left-admin.html'
          },
          body: {
            templateUrl: 'views/body.html',
            controller: "AdminCtrl",
            resolve: {
              isAdmin: function (user, $state) {
                if (!user.private.isAdmin) {
                  $state.go('authenticated.master.nav.dashboard');
                  return false;
                } else {
                  return true;
                }
              },
              theme: function (AdminService) {
                return AdminService.getTheme();
              },
              settings: function (AdminService) {
                return AdminService.getSettings();
              }
            }
          },
          footer: {
            templateUrl: 'views/admin-footer.html',
            controller: 'FooterCtrl',
            resolve: {
              limit: function () {
                return 12;
              },
              files: function (AdminService, limit) {
                return AdminService.getOriginals({orderByPriority: true, limitToLast: limit});
              }
            }
          }
        }
      })
      .state('authenticated.master.admin.words', { // ******************************  Words ****************************
        abstract: true,
        templateUrl: 'views/admin-words.html',
        controller: 'WordsCtrl',
        resolve: {
          words: function (AdminService) {
            return AdminService.getWords();
          },
          hashtags: function (AdminService) {
            return AdminService.getHashtags();
          }
        }
      })
      .state('authenticated.master.admin.words.list', {
        url: '/words',
        templateUrl: 'views/admin-words-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function () {
            return 5;
          },
          getRef: function (AdminService) {
            return AdminService.getWords;
          },
          ref: function (AdminService, limit) {
            return AdminService.getWords({orderByPriority: true, limitToLast: limit});
          }
        }
      })
      .state('authenticated.master.admin.word', {
        url: '/words/:key',
        templateUrl: 'views/admin-word.html',
        controller: 'WordCtrl',
        resolve: {
          word: function (AdminService, $stateParams) {
            return AdminService.getWord($stateParams.key);
          },
          drafts: function (AdminService, $stateParams) {
            return AdminService.getDrafts($stateParams.key);
          },
          files: function (AdminService) {
            return AdminService.getFiles().$loaded();
          }
        }
      })
      .state('authenticated.master.admin.assignments', { // ************************  Assignments **********************
        url: '/assignments',
        templateUrl: 'views/admin-assignments.html',
        controller: 'AssignmentsCtrl',
        resolve: {
          assignments: function (AdminService) {
            return AdminService.getAssignments();
          }
        }
      })
      .state('authenticated.master.admin.assignment', {
        url: '/assignment/:key',
        templateUrl: 'views/admin-assignment.html',
        controller: 'AssignmentCtrl',
        resolve: {
          products: function (AdminService) {
            return AdminService.getProducts({orderByChild: 'type', equalTo: 'subscription'});
          },
          assignment: function (AdminService, $stateParams) {
            return AdminService.getAssignment($stateParams.key);
          }
        }
      })
      .state('authenticated.master.admin.files', { // ******************************  Files ****************************
        abstract: true,
        templateUrl: 'views/admin-files.html',
        controller: 'FilesCtrl',
        resolve: {
          bucket: function (AdminService) {
            return AdminService.getBucket();
          },
          notifications: function (AdminService, user) {
            return AdminService.getNotifications(user.$id);
          }
        }
      })
      .state('authenticated.master.admin.files.list', {
        url: '/files/:search',
        templateUrl: 'views/admin-files-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function () {
            return 5;
          },
          getRef: function (AdminService) {
            return AdminService.getOriginals;
          },
          ref: function (AdminService, limit) {
            return AdminService.getOriginals({orderByPriority: true, limitToFirst: limit});
          }
        }
      })
      .state('authenticated.master.admin.products', { // ***************************  Products *************************
        url: '/products',
        templateUrl: 'views/admin-products.html',
        controller: 'ProductsCtrl',
        resolve: {
          products: function (AdminService) {
            return AdminService.getProducts();
          },
          files: function (AdminService) {
            return AdminService.getFiles();
          }
        }
      })
      .state('authenticated.master.admin.product', {
        url: '/product/:key',
        templateUrl: 'views/admin-product.html',
        controller: 'ProductCtrl',
        resolve: {
          product: function (AdminService, $stateParams) {
            return AdminService.getProduct($stateParams.key);
          },
          productImages: function (AdminService, $stateParams) {
            return AdminService.getProductImages($stateParams.key);
          },
          productOptionGroups: function (AdminService, $stateParams) {
            return AdminService.getProductOptionGroups($stateParams.key);
          },
          productOptionsMatrix: function (AdminService, $stateParams) {
            return AdminService.getProductOptionsMatrix($stateParams.key);
          },
          files: function (AdminService) {
            return AdminService.getFiles();
          },
          hashtags: function (AdminService) {
            return AdminService.getHashtags();
          }

        }
      })
      .state('authenticated.master.admin.users', { // ******************************  Users ****************************
        abstract: true,
        templateUrl: 'views/admin-users.html',
        controller: 'UsersCtrl',
        resolve: {
          messageable: function (AdminService) {
            return AdminService.getMessageable();
          }
        }
      })
      .state('authenticated.master.admin.users.list', {
        url: '/users/:search',
        templateUrl: 'views/admin-users-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function () {
            return 10;
          },
          getRef: function (AdminService) {
            return AdminService.getUsers;
          },
          ref: function (AdminService, limit) {
            return AdminService.getUsers({orderByPriority: true, limitToLast: limit});
          }
        }
      })
      .state('authenticated.master.admin.user', {
        url: '/user/:key',
        templateUrl: 'views/admin-user.html',
        controller: 'UserCtrl',
        resolve: {
          user: function (AdminService, $stateParams) {
            return AdminService.getUser($stateParams.key);
          }
        }
      })
      .state('authenticated.master.admin.settings', { // ***************************  Settings *************************
        url: '/settings',
        templateUrl: 'views/admin-settings.html',
        controller: 'SettingsCtrl'
      })
      .state('authenticated.master.admin.commerce', {
        url: '/commerce',
        templateUrl: 'views/admin-commerce.html',
        controller: 'CommerceCtrl',
        resolve: {
          commerce: function (AdminService) {
            return AdminService.getCommerce();
          },
          countries: function (CommerceService) {
            return CommerceService.getCountries();
          },
          states: function (CommerceService) {
            return CommerceService.getStates();
          }
        }
      })
      .state('authenticated.master.admin.surveys', { // ****************************  Surveys **************************
        abstract: true,
        templateUrl: 'views/admin-surveys.html',
        controller: 'SurveysCtrl',
        resolve: {
          surveys: function (AdminService) {
            return AdminService.getSurveys();
          }
        }
      })
      .state('authenticated.master.admin.surveys.list', {
        url: '/surveys/:search',
        templateUrl: 'views/admin-surveys-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function () {
            return 10;
          },
          getRef: function (AdminService) {
            return AdminService.getSurveys;
          },
          ref: function (AdminService, limit) {
            return AdminService.getSurveys({orderByPriority: true, limitToLast: limit});
          }
        }
      })
      .state('authenticated.master.admin.survey', {
        url: '/survey/:key',
        templateUrl: 'views/admin-survey.html',
        controller: 'SurveyCtrl',
        resolve: {
          survey: function (AdminService, $stateParams) {
            return AdminService.getSurvey($stateParams.key);
          },
          answers: function (AdminService, $stateParams) {
            return AdminService.getSurveyAnswers($stateParams.key);
          }
        }
      })
      .state('authenticated.master.admin.discounts', { // **************************  Discounts ************************
        abstract: true,
        templateUrl: 'views/admin-discounts.html',
        controller: 'DiscountsCtrl'
      })
      .state('authenticated.master.admin.discounts.list', {
          url: '/discounts/:search',
          templateUrl: 'views/admin-discounts-list.html',
          controller: 'ListCtrl',
          resolve: {
            limit: function () {
              return 3;
            },
            getRef: function (AdminService) {
              return AdminService.getDiscounts;
            },
            ref: function (AdminService, limit) {
              return AdminService.getDiscounts({orderByPriority: true, limitToLast: limit});
            }
          }
      })
      .state('authenticated.master.admin.social', { // *****************************  Social ***************************
        url: '/social-media',
        templateUrl: 'views/admin-social.html',
        controller: 'SocialCtrl',
        resolve: {
          social: function (AdminService) {
            return AdminService.getSocial();
          },
          instagramTerms: function (AdminService) {
            return AdminService.getInstagramTerms();
          }
        }
      })
      .state('authenticated.master.admin.hashtags', { // ***************************  Hashtags *************************
        url: '/hashtags',
        templateUrl: 'views/admin-hashtags.html',
        controller: 'HashtagsCtrl',
        resolve: {
          hashtags: function (AdminService) {
            return AdminService.getHashtags();
          }
        }
      })
      .state('authenticated.master.admin.transactions', { // ***********************  Transactions *********************
        abstract: true,
        templateUrl: 'views/admin-transactions.html',
        controller: 'TransactionsCtrl'
      })
      .state('authenticated.master.admin.transactions.list', {
        url: '/transactions/:search',
        templateUrl: 'views/admin-transactions-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function () {
            return 10;
          },
          getRef: function (AdminService) {
            return AdminService.getTransactions;
          },
          ref: function (AdminService, limit) {
            return AdminService.getTransactions({orderByPriority: true, limitToLast: limit});
          }
        }
      })
      .state('authenticated.master.admin.transaction', {
        url: '/transaction/:key/user/:userId',
        templateUrl: 'views/admin-transaction.html',
        controller: 'TransactionCtrl',
        resolve: {
          transaction: function (AdminService, $stateParams) {
            return AdminService.getTransaction($stateParams.key);
          },
          userTransaction: function (UserService, $stateParams) {
            return UserService.getTransaction($stateParams.userId, $stateParams.key);
          }
        }
      })
      .state('authenticated.master.admin.subscriptions', { // ***********************  Subscriptions *******************
        abstract: true,
        templateUrl: 'views/admin-subscriptions.html',
        controller: 'SubscriptionsCtrl'
      })
      .state('authenticated.master.admin.subscriptions.list', {
        url: '/subscriptions/:search',
        templateUrl: 'views/admin-subscriptions-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function() {
            return 2;
          },
          getRef: function (AdminService) {
            return AdminService.getSubscriptions;
          },
          ref: function(AdminService, limit) {
            return AdminService.getSubscriptions({orderByPriority: true, limitToLast: limit});
          }
        }
      })
      .state('authenticated.master.admin.subscription', { // ***********************  Subscriptions *******************
        url: '/subscription/:key',
        templateUrl: 'views/admin-subscription.html',
        controller: 'SubscriptionCtrl',
        resolve: {
          subscription: function(AdminService, $stateParams) {
            return AdminService.getSubscription($stateParams.key);
          },
          userSubscription: function (UserService, subscription, $q) {
            return subscription.$loaded().then(function (subscription) {
              return UserService.getSubscription(subscription.user.public.id, subscription.keys.user);
            });
          }
        }
      })
      .state('authenticated.master.admin.shipments', { // **************************  Shipments ************************
        abstract: true,
        templateUrl: 'views/admin-shipments.html',
        controller: 'ShipmentsCtrl'
      })
      .state('authenticated.master.admin.shipments.list', {
        url: '/shipments/:search',
        templateUrl: 'views/admin-shipments-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function () {
            return 10;
          },
          getRef: function (AdminService) {
            return AdminService.getShipments;
          },
          ref: function (AdminService, limit) { 
            return AdminService.getShipments({orderByPriority: true, limitToLast: limit});
          }
        }
      })
      .state('authenticated.master.admin.resources', { // **************************  Resources ************************
        abstract: true,
        templateUrl: 'views/admin-resources.html',
        controller: 'ResourcesCtrl'
      })
      .state('authenticated.master.admin.resources.list', {
        url: '/resources/:search',
        templateUrl: 'views/admin-resources-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function () {
            return 10;
          },
          getRef: function (AdminService) {
            return AdminService.getResources;
          },
          ref: function (AdminService, limit) { 
            return AdminService.getResources({orderByPriority: true, limitToLast: limit});
          }
        }
      })
      .state('authenticated.master.admin.messages', { // ***************************  Messages *************************
        abstract: true,
        templateUrl: 'views/admin-messages.html'
      })
      .state('authenticated.master.admin.messages.list', {
        url: '/messages/:search',
        templateUrl: 'views/admin-messages-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function () {
            return 10;
          },
          getRef: function (AdminService) {
            return AdminService.getMessages;
          },
          ref: function (AdminService, limit) {
            return AdminService.getMessages({orderByPriority: true, limitToLast: limit});
          }
        }
      })
      .state('authenticated.master.admin.uploads', { // ****************************  Uploads **************************
        abstract: true,
        templateUrl: 'views/admin-uploads.html',
        controller: 'UploadsCtrl'
      })
      .state('authenticated.master.admin.uploads.list', {
        url: '/uploads/:search',
        templateUrl: 'views/admin-uploads-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function () {
            return 5;
          },
          getRef: function (AdminService) {
            return AdminService.getUploads;
          },
          ref: function (AdminService, limit) {
            return AdminService.getUploads({orderByPriority: true, limitToLast: limit});
          }
        }
      })
      .state('authenticated.master.admin.feedback', { // ***************************  Assignment ***********************
        url: '/user/:userId/feedback/:assignmentKey',
        templateUrl: 'views/admin-feedback.html',
        controller: 'FeedbackCtrl',
        resolve: {
          client: function (AdminService, $stateParams) {
            return AdminService.getUser($stateParams.userId);
          },
          assignment: function (AdminService, $stateParams) {
            return AdminService.getAssignment($stateParams.assignmentKey);
          },
          userAssignment: function (UserService, $stateParams) {
            return UserService.getAssignment($stateParams.userId, $stateParams.assignmentKey);
          },
          assignmentUploads: function (UserService, $stateParams) {
            return UserService.getAssignmentUploads($stateParams.userId, $stateParams.assignmentKey);
          },
          assignmentMessages: function (UserService, $stateParams) {
            return UserService.getAssignmentMessages($stateParams.userId, $stateParams.assignmentKey);
          }
        }
      })
      .state('authenticated.master.admin.email', { // ******************************  Email Queue **********************
        abstract: true,
        templateUrl: 'views/admin-email.html',
        controller: 'EmailCtrl'
      })
      .state('authenticated.master.admin.email.list', {
        url: '/email',
        templateUrl: 'views/admin-email-list.html',
        controller: 'ListCtrl',
        resolve: {
          limit: function () {
            return 10;
          },
          getRef: function (AdminService) {
            return AdminService.getEmailQueue;
          },
          ref: function (AdminService, limit) {
            return AdminService.getEmailQueue({orderByPriority: true, limitToLast: limit}); 
          }
        }
      });


});
