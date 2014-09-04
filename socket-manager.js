/*
 * Author	:	Harish Subramanium
 * Date		:	08/07/2014
 *
 * An opinionated socketio wrapper for Angular JS.
 *
 * It accepts a socket connection and wraps helper methods around it to work
 * within the angular framework.
 */
(function() {
	"use strict";

	var httpCodes = {
		'100': 'Continue',
		'101': 'Switching Protocols',
		'102': 'Processing',
		'200': 'OK',
		'201': 'Created',
		'202': 'Accepted',
		'203': 'Non-Authoritative Information',
		'204': 'No Content',
		'205': 'Reset Content',
		'206': 'Partial Content',
		'207': 'Multi-Status',
		'300': 'Multiple Choices',
		'301': 'Moved Permanently',
		'302': 'Moved Temporarily',
		'303': 'See Other',
		'304': 'Not Modified',
		'305': 'Use Proxy',
		'307': 'Temporary Redirect',
		'400': 'Bad Request',
		'401': 'Unauthorized',
		'402': 'Payment Required',
		'403': 'Forbidden',
		'404': 'Not Found',
		'405': 'Method Not Allowed',
		'406': 'Not Acceptable',
		'407': 'Proxy Authentication Required',
		'408': 'Request Time-out',
		'409': 'Conflict',
		'410': 'Gone',
		'411': 'Length Required',
		'412': 'Precondition Failed',
		'413': 'Request Entity Too Large',
		'414': 'Request-URI Too Large',
		'415': 'Unsupported Media Type',
		'416': 'Requested Range Not Satisfiable',
		'417': 'Expectation Failed',
		'418': 'I\'m a teapot',
		'422': 'Unprocessable Entity',
		'423': 'Locked',
		'424': 'Failed Dependency',
		'425': 'Unordered Collection',
		'426': 'Upgrade Required',
		'428': 'Precondition Required',
		'429': 'Too Many Requests',
		'431': 'Request Header Fields Too Large',
		'500': 'Internal Server Error',
		'501': 'Not Implemented',
		'502': 'Bad Gateway',
		'503': 'Service Unavailable',
		'504': 'Gateway Time-out',
		'505': 'HTTP Version Not Supported',
		'506': 'Variant Also Negotiates',
		'507': 'Insufficient Storage',
		'509': 'Bandwidth Limit Exceeded',
		'510': 'Not Extended',
		'511': 'Network Authentication Required'
	};

	angular.module('socket-manager', []).provider('SocketManager', function() {


		this.$get = ['$q', '$rootScope', '$log', function($q, $rootScope, $log) {

			var eventCount = {};
			var globalEvents = [];
			var scopeEvents = {};

			function sendResponse(promise, resObj) {
				if(!_.isUndefined(resObj.data)) return promise.resolve(resObj.data);
				promise.reject({message: 'Response data isn\'t defined', response: resObj});
			}

			var retObj = {};

			retObj.init = function(socket, type) {

				var http = type && type === 'http';

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

						args.forEach(function(item) {
							if(item) reqParams.push(item);
						});

						if(http) {

							var logObject = {
								event: event,
								arguments: _.clone(reqParams).shift()
							};

							// HTTP based server responses
							reqParams.push(function(res) {
								if(!res.statusCode) d.reject({ message : 'Invalid Response format received from the server', response: res});

								var code = parseInt(res.statusCode);

								logObject.statusCode = code;
								logObject.status = httpCodes[code] || 'Invalid Code';
								logObject.response = res.data ? res.data : res;

								// Success and redirection responses
								if((code >= 200 && code < 300) || (code === 301 || code === 302 || code === 307)) {
									$log.debug(logObject);
									return sendResponse(d, res);
								}

								if(code >= 300 && code < 400) {
									$log.info('Non standard status code received', logObject);
									return sendResponse(d, res);
								}

								if(code >= 400) {
									$log.error('Request Error', logObject);
									return d.reject({message: httpCodes[code] || 'Invalid Code', response: res});
								}
							});

						} else {

							// Normal err/res response handler
							reqParams.push(function(err, res) {
								if (err) d.reject(err);
								else d.resolve(res);
							});
						}

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
})();