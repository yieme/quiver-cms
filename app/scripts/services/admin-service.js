'use strict';

angular.module('quiverCmsApp')
  .service('AdminService', function AdminService($firebase, env, Restangular) {
    var firebaseEndpoint = env.firebase;

    return {
      getWords: function () {
        return $firebase(new Firebase(firebaseEndpoint + '/content/words'));
      },

      getWord: function (key) {
        return $firebase(new Firebase(firebaseEndpoint + '/content/words/' + key));
      },

      getDrafts: function (key) {
        return $firebase(new Firebase(firebaseEndpoint + '/content/words/' + key + '/drafts'));
      },

      getFiles: function () {
        return $firebase(new Firebase(firebaseEndpoint + '/content/files'));
      },

      getFile: function (key) {
        return $firebase(new Firebase(firebaseEndpoint + '/content/files/' + key));
      },

      getNotifications: function (userId) {
        return $firebase(new Firebase(firebaseEndpoint + '/users/' + userId + '/notifications'));
      },

      getHashtags: function () {
        return $firebase(new Firebase(firebaseEndpoint + '/content/hashtags'));
      },

      getLocations: function () {
        return $firebase(new Firebase(firebaseEndpoint + '/content/locations'));
      },

      getSocial: function () {
        return $firebase(new Firebase(firebaseEndpoint + '/content/social'));
      },

      getInstagramTerms: function () {
        return $firebase(new Firebase(firebaseEndpoint + '/content/social/instagram/terms'));
      },

      updateInstagram: function () {
        return Restangular.one('instagram').get();
      },

      getTheme: function () {
        return $firebase(new Firebase(firebaseEndpoint + '/theme'));
      },

      getSettings: function () {
        return $firebase(new Firebase(firebaseEndpoint + '/settings'));
      }
    }
  });