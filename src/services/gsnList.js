(function(angular, undefined) {
  'use strict';
  var serviceId = 'gsnList';
  angular.module('gsn.core').factory(serviceId, ['$rootScope', '$http', 'gsnApi', '$q', '$localStorage', gsnList]);

  function gsnList($rootScope, $http, gsnApi, $q, $localStorage) {

    var betterStorage = $localStorage;

    // just a shopping list object
    function myShoppingList(shoppingListId, shoppingList) {
      var returnObj = {
        ShoppingListId: shoppingListId
      };
      var $mySavedData = {
        list: shoppingList,
        items: {},
        hasLoaded: false,
        countCache: 0,
        itemIdentity: 1
      };

      returnObj.getItemKey = function(item) {
        var itemKey = item.ItemTypeId;
        if (item.ItemTypeId === 7 || item.AdCode) {
          itemKey = item.AdCode + gsnApi.isNull(item.BrandName, '') + gsnApi.isNull(item.Description, '');
        }

        return itemKey + '_' + item.ItemId;
      };

      // replace local item with server item
      function processServerItem(serverItem, localItem) {
        if (serverItem) {
          var itemKey = returnObj.getItemKey(localItem);

          // set new server item order
          serverItem.Order = localItem.Order;

          // remove existing item locally if new id has been detected
          if (serverItem.ItemId !== localItem.ItemId) {
            returnObj.removeItem(localItem, true);
          }

          // Add the new server item.
          $mySavedData.items[returnObj.getItemKey(serverItem)] = serverItem;
          saveListToSession();
        }
      }

      returnObj.syncItem = function(itemToSync) {
        var existingItem = returnObj.getItem(itemToSync.ItemId, itemToSync.ItemTypeId) || itemToSync;
        if (existingItem !== itemToSync) {
          existingItem.Quantity = itemToSync.Quantity;
        }

        if (parseInt(existingItem.Quantity) <= 0) {
          returnObj.removeItem(existingItem);
        }

        saveListToSession();
        $rootScope.$broadcast('gsnevent:shoppinglist-changed', returnObj);
      };

      // add item to list
      returnObj.addItem = function(item, deferSync) {
        if (gsnApi.isNull(item.ItemId, 0) <= 0) {

          // this is to help with getItemKey?
          item.ItemId = ($mySavedData.itemIdentity++);
        }

        $mySavedData.countCache = 0;
        var existingItem = $mySavedData.items[returnObj.getItemKey(item)];

        if (gsn.isNull(existingItem, null) === null) {
          // remove any ties to existing shopping list
          item.Id = undefined;
          item.ShoppingListItemId = undefined;
          item.ShoppingListId = returnObj.ShoppingListId;
          item.CategoryId = item.CategoryId || -1;
          item.Quantity = gsnApi.isNaN(parseInt(item.Quantity || item.NewQuantity), 1);

          existingItem = item;
          $mySavedData.items[returnObj.getItemKey(existingItem)] = existingItem;
        } else { // update existing item

          var newQuantity = gsnApi.isNaN(parseInt(item.Quantity), 1);
          var existingQuantity = gsnApi.isNaN(parseInt(existingItem.Quantity), 1);
          if (newQuantity > existingQuantity) {
            existingItem.Quantity = newQuantity;
          } else {
            existingItem.Quantity = existingQuantity + newQuantity;
          }
        }

        if (existingItem.IsCoupon) {

          // Get the temp quantity.
          var tmpQuantity = gsnApi.isNaN(parseInt(existingItem.Quantity), 0);

          // Now, assign the quantity.
          existingItem.Quantity = (tmpQuantity > 0) ? tmpQuantity : 1;
        }

        existingItem.Order = ($mySavedData.itemIdentity++);
        existingItem.RowKey = returnObj.getItemKey(existingItem);

        if (!gsnApi.isNull(deferSync, false)) {
          returnObj.syncItem(existingItem);
        } else {
          saveListToSession();
        }

        return existingItem;
      };

      returnObj.addItems = function(items) {
        var toAdd = [];
        angular.forEach(items, function(v, k) {
          var rst = angular.copy(returnObj.addItem(v, true));
          toAdd.push(rst);
        });

        saveListToSession();

        return returnObj;
      };

      // remove item from list
      returnObj.removeItem = function(inputItem) {
        var item = returnObj.getItem(inputItem);
        if (item) {
          item.Quantity = 0;

          // stupid ie8, can't simply delete
          var removeK = returnObj.getItemKey(item);
          try {
            delete $mySavedData.items[removeK];
          } catch (e) {

            var items = {};
            angular.forEach($mySavedData.items, function(v, k) {
              if (k !== removeK)
                items[k] = v;
            });

            $mySavedData.items = items;
          }

          saveListToSession();
        }

        return returnObj;
      };

      // get item by object or id
      returnObj.getItem = function(itemId, itemTypeId) {
        // just return whatever found, no need to validate item
        // it's up to the user to call isValidItem to validate
        var adCode, brandName, myDescription;
        if (typeof(itemId) === 'object') {
          adCode = itemId.AdCode;
          brandName = itemId.BrandName;
          myDescription = itemId.Description;
          itemTypeId = itemId.ItemTypeId;
          itemId = itemId.ItemId;
        }

        var myItemKey = returnObj.getItemKey({
          ItemId: itemId,
          ItemTypeId: gsnApi.isNull(itemTypeId, 8),
          AdCode: adCode,
          BrandName: brandName,
          Description: myDescription
        });
        return $mySavedData.items[myItemKey];
      };

      returnObj.isValidItem = function(item) {
        var itemType = typeof(item);

        if (itemType !== 'undefined' && itemType !== 'function') {
          return (item.Quantity > 0);
        }

        return false;
      };

      // return all items
      returnObj.allItems = function() {
        var result = [];
        var items = $mySavedData.items;
        angular.forEach(items, function(item, index) {
          if (returnObj.isValidItem(item)) {
            result.push(item);
          }
        });

        return result;
      };

      // get count of items
      returnObj.getCount = function() {
        if ($mySavedData.countCache > 0) return $mySavedData.countCache;

        var count = 0;
        var items = $mySavedData.items;
        var isValid = true;
        angular.forEach(items, function(item, index) {
          if (!item) {
            isValid = false;
            return;
          }

          if (returnObj.isValidItem(item)) {
            count += gsnApi.isNaN(parseInt(item.Quantity), 0);
          }
        });

        if (!isValid) {
          $mySavedData.items = {};
          $mySavedData.hasLoaded = false;
          returnObj.updateShoppingList();
        }

        $mySavedData.countCache = count;
        return count;
      };

      returnObj.getTitle = function() {
        return ($mySavedData.list) ? $mySavedData.list.Title : '';
      };

      returnObj.getStatus = function() {
        return ($mySavedData.list) ? $mySavedData.list.StatusId : 1;
      };

      // cause shopping list delete
      returnObj.deleteList = function() {
        // call DeleteShoppingList
        $mySavedData.items = {};
        $mySavedData.itemIdentity = 1;
        $mySavedData.countCache = 0;
        saveListToSession();
        return returnObj;
      };

      // cause change to shopping list title
      returnObj.setTitle = function(title) {

        $mySavedData.countCache = 0;
        $mySavedData.list.Title = title;
        return returnObj;
      };

      returnObj.hasLoaded = function() {
        return $mySavedData.hasLoaded;
      };

      returnObj.getListData = function() {
        return angular.copy($mySavedData.list);
      };

      function saveListToSession() {
        betterStorage.currentShoppingList = $mySavedData;

        // Since we are chainging the saved data, the count is suspect.
        $mySavedData.countCache = 0;
      }

      function loadListFromSession() {
        var list = betterStorage.currentShoppingList;
        if (!list || !list.list) {
          saveListToSession()
          list = betterStorage.currentShoppingList;
        }

        list.list.Id = shoppingListId;
        $mySavedData.hasLoaded = list.hasLoaded;
        $mySavedData.items = list.items;
        $mySavedData.itemIdentity = list.itemIdentity;
        $mySavedData.countCache = list.countCache;
        $mySavedData.hasLoaded = true;
      }


      function processShoppingList(result) {
        $mySavedData.items = {};

        angular.forEach(result, function(item, index) {
          item.Order = index;
          item.RowKey = returnObj.getItemKey(item);
          $mySavedData.items[returnObj.getItemKey(item)] = item;
        });

        $mySavedData.hasLoaded = true;
        $mySavedData.itemIdentity = result.length + 1;
        $rootScope.$broadcast('gsnevent:shoppinglist-loaded', returnObj, result);
        saveListToSession();
      }

      returnObj.updateShoppingList = function() {
        if (returnObj.deferred) return returnObj.deferred.promise;

        var deferred = $q.defer();
        returnObj.deferred = deferred;

        if ($mySavedData.hasLoaded) {
          $rootScope.$broadcast('gsnevent:shoppinglist-loaded', returnObj, $mySavedData.items);
          deferred.resolve({
            success: true,
            response: returnObj
          });
          returnObj.deferred = null;
        } else {
          $mySavedData.items = {};
          $mySavedData.countCache = 0;
          loadListFromSession();
        }

        return deferred.promise;
      };

      loadListFromSession();

      return returnObj;
    }

    return myShoppingList;
  }
})(angular);
