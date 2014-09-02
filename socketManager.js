/*
 * Author	:	Harish Subramanium
 * Date		:	08/07/2014
 *
 * An opinionated socketio wrapper for Angular JS.
 *
 * It accepts a socket connection and wraps helper methods around it to work
 * within the angular framework.
 */

angular.module('socket-manager', []).provider('SocketManager', function() {
    "use strict";

    this.$get = ['$q', '$rootScope', function($q, $rootScope) {

        var eventCount = {};
        var globalEvents = [];
        var scopeEvents = {};

        var retObj = {};

        retObj.init = function(socket) {

            function OnEvent(event, scope) {

                var self = this;

                self.event = event;
                self.scope = scope ? scope.$id : false;

                if (!eventCount[self.event]) eventCount[self.event] = 0;

                self.socketHandler = function () {
                    var args = Array.prototype.slice.call(arguments, 0);

                    if (globalEvents[self.event].length) {
                        globalEvents[self.event].forEach(function (fn) {
                            return fn.apply(null, args);
                        });
                    }

                    // Calling all attached scope handlers and then applying to view
                    var scopeFns = [];

                    Object.keys(scopeEvents[self.event]).forEach(function (scopeID) {
                        scopeFns = scopeFns.concat(scopeEvents[self.event][scopeID]);
                    });

                    if (scopeFns.length > 0) {
                        $rootScope.$apply(function () {
                            scopeFns.forEach(function (fn) {
                                return fn.apply(null, args);
                            })
                        });
                    }

                    return true;
                };

                if (self.scope) {
                    scope.$on('$destroy', function () {
                        self.destroy();
                    });
                }

                return self;
            }

            OnEvent.prototype.then = function (fn) {
                var self = this;
                if (!_.isFunction(fn)) throw new Error('Argument must be a function');


                if (!globalEvents[self.event]) globalEvents[self.event] = [];

                if (!scopeEvents[self.event]) scopeEvents[self.event] = {};

                if (!scopeEvents[self.event][self.scope]) scopeEvents[self.event][self.scope] = [];

                if (!eventCount[self.event]) {
                    socket.on(self.event, self.socketHandler);
                }

                if (self.scope) {
                    scopeEvents[self.event][self.scope].push(fn);
                } else {
                    globalEvents[self.event].push(fn);
                }

                eventCount[self.event]++;

                return self;
            };

            OnEvent.prototype.destroy = function () {
                var self = this;
                eventCount[self.event] = eventCount[self.event] - scopeEvents[self.event][self.scope].length;

                scopeEvents[self.event][self.scope] = [];
                delete scopeEvents[self.event][self.scope];

                if (!eventCount[self.event]) socket.removeListener(self.event, self.socketHandler);

                return false;
            };

            return {
                /**
                 * Emit Socket events. Returns a promise that will be resolved if a callback is passed to it.
                 * Expects response using typical nodejs (err, res) pattern.
                 */
                emit: function () {
                    var d = $q.defer();

                    var args = Array.prototype.slice.call(arguments);

                    var event = args.shift();
                    if (!event) d.reject("No event passed through");

                    var reqParams = [event];

                    args.forEach(function (item) {
                        if (item) reqParams.push(item);
                    });

                    reqParams.push(function (err, res) {
                        if (err) d.reject(err);
                        else d.resolve(res);
                    });

                    // Calling socket using its own context
                    socket.emit.apply(socket, reqParams);

                    return d.promise;
                },

                /**
                 * Watch for updates on the socket.
                 *
                 * @param event - Name of the event to watch for
                 * @param $scope - Controller scope, if calling from a controller
                 * @returns {object} - Returns object with then and destroy methods
                 */
                on: function (event, $scope) {
                    return new OnEvent(event, $scope);
                }
            }
        };

        return retObj;

    }]
});