'use strict';

var _Tunnel;

function _load_Tunnel() {
  return _Tunnel = _interopRequireWildcard(require('../lib/Tunnel'));
}

var _Connection;

function _load_Connection() {
  return _Connection = require('../lib/Connection');
}

var _net = _interopRequireDefault(require('net'));

var _rxjsBundlesRxMinJs = require('rxjs/bundles/Rx.min.js');

var _log4js;

function _load_log4js() {
  return _log4js = require('log4js');
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

const TEST_PORT = 5004; /**
                         * Copyright (c) 2015-present, Facebook, Inc.
                         * All rights reserved.
                         *
                         * This source code is licensed under the license found in the LICENSE file in
                         * the root directory of this source tree.
                         *
                         *  strict-local
                         * @format
                         */

const cf = new (_Connection || _load_Connection()).ConnectionFactory();

describe.skip('createTunnel', () => {
  let td;

  beforeEach(() => {
    (0, (_log4js || _load_log4js()).getLogger)('SocketService-spec').debug('--SPEC START--');
    td = {
      to: {
        host: 'localhost',
        port: TEST_PORT + 1,
        family: 6
      },
      from: {
        host: 'localhost',
        port: TEST_PORT,
        family: 6
      }
    };
  });

  afterEach(() => {
    (0, (_log4js || _load_log4js()).getLogger)('SocketService-spec').debug('--SPEC END--');
  });

  it('should set up a listener that a client can connect to', async () => {
    const events = (_Tunnel || _load_Tunnel()).createTunnel(td, new (_Connection || _load_Connection()).ConnectionFactory());
    let serverListening = false;
    let subscription;

    await new Promise(resolve => {
      subscription = events.refCount().subscribe({
        next: event => {
          if (event.type === 'server_started') {
            serverListening = true;
            resolve();
          }
        }
      });
    });

    expect(serverListening).toBe(true);
    await testConnectability(TEST_PORT);

    if (!subscription) {
      throw new Error('Invariant violation: "subscription"');
    }

    subscription.unsubscribe();
  });

  it('should return a ConnectableObservable that emits listener events', async () => {
    const events = (_Tunnel || _load_Tunnel()).createTunnel(td, cf);
    const eventList = [];
    let types;

    const subscription = events.refCount().subscribe({
      next: event => {
        eventList.push(event);
      }
    });

    await testConnectability(TEST_PORT);
    subscription.unsubscribe();
    types = eventList.map(event => event.type);
    expect(types).toContain('server_started');
    expect(types).toContain('client_connected');
    expect(types).toContain('client_disconnected');
  });

  it('should send replies back to the originating client', async done => {
    const message = 'HELLO WORLD';
    let response = null;
    let echoServer;

    // start echo server
    echoServer = _net.default.createServer(socket => {
      socket.pipe(socket);
    });
    await new Promise(resolve => {
      echoServer.listen({ host: '::', port: TEST_PORT + 1 }, resolve);
    });

    // create tunnel
    const subscription = (_Tunnel || _load_Tunnel()).createTunnel(td, cf).refCount().subscribe();

    // create connection and send data
    await new Promise(resolve => {
      const socket = _net.default.createConnection(TEST_PORT, () => {
        socket.on('data', data => {
          response = data.toString();
          resolve();
        });
        socket.write(new Buffer(message));
      });
    });

    expect(message).toEqual(response);
    subscription.unsubscribe();

    if (!done) {
      throw new Error('Invariant violation: "done"');
    }

    echoServer.close(done);
  });

  it('should re-tunnel if the port is already bound on a tunnel', async done => {
    let subscription = null;
    await new Promise(resolve => {
      subscription = (_Tunnel || _load_Tunnel()).createTunnel(td, cf).refCount().subscribe({
        next: resolve
      });
    });

    await new Promise(resolve => {
      subscription = (_Tunnel || _load_Tunnel()).createTunnel(td, cf).refCount().subscribe({
        next: resolve
      });
    });

    if (!subscription) {
      throw new Error('Invariant violation: "subscription"');
    }

    subscription.unsubscribe();

    if (!done) {
      throw new Error('Invariant violation: "done"');
    }

    done();
  });

  it('should stop listening when the observable is unsubscribed', async () => {
    const observable = (_Tunnel || _load_Tunnel()).createTunnel(td, cf);

    await new Promise(resolve => {
      const subscription = observable.refCount().take(1).subscribe({
        next: event => {
          resolve(event);
          subscription.unsubscribe();
        }
      });
    });

    await testConnectability(TEST_PORT);
  });

  it('should allow for multiple clients to connect and interact', async done => {
    let toServer;
    const sockets = [];
    let subscription = null;

    // create the 'to' server
    await new Promise(resolve => {
      toServer = _net.default.createServer(socket => {
        socket.pipe(socket);
      });
      toServer.listen({ host: '::', port: TEST_PORT + 1 }, resolve);
    });

    await new Promise(resolve => {
      subscription = (_Tunnel || _load_Tunnel()).createTunnel(td, cf).refCount().subscribe({ next: resolve });
    });

    await new Promise(resolve => {
      sockets.push(_net.default.createConnection(TEST_PORT, resolve));
    });

    await new Promise(resolve => {
      sockets.push(_net.default.createConnection(TEST_PORT, resolve));
    });

    await new Promise(resolve => {
      sockets.forEach((socket, index) => {
        socket.on('data', data => {
          expect(data.toString()).toEqual('data' + index);
        });
        socket.write(new Buffer('data' + index));
      });
      resolve();
    });

    if (!subscription) {
      throw new Error('Invariant violation: "subscription"');
    }

    subscription.unsubscribe();

    if (!toServer) {
      throw new Error('Invariant violation: "toServer"');
    }

    toServer.close(done);
  });

  it('should handle clients that error out', async done => {
    let subscription = null;
    let toServer;

    // create the 'to' server
    await new Promise(resolve => {
      toServer = _net.default.createServer(socket => {
        socket.pipe(socket);
      });
      toServer.listen({ host: '::', port: TEST_PORT + 1 }, resolve);
    });

    await new Promise(resolve => {
      subscription = (_Tunnel || _load_Tunnel()).createTunnel(td, cf).refCount().subscribe({ next: resolve });
    });

    await new Promise(resolve => {
      const socket = _net.default.createConnection(TEST_PORT, () => {
        socket.destroy(new Error('boom'));
        resolve();
      });
      socket.on('error', () => {});
    });

    if (!subscription) {
      throw new Error('Invariant violation: "subscription"');
    }

    subscription.unsubscribe();

    if (!toServer) {
      throw new Error('Invariant violation: "toServer"');
    }

    toServer.close(done);
  });
});

async function testConnectability(port) {
  return new Promise((resolve, reject) => {
    const socket = _net.default.connect(port);
    socket.on('error', err => reject(err));

    if (!socket) {
      throw new Error('Invariant violation: "socket"');
    }

    socket.on('connect', async () => {
      socket.write(new Buffer('hello world'));
      socket.on('end', () => resolve());
      socket.end();
    });
  });
}