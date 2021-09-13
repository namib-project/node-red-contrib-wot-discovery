const WoTScriptingNode = require('../nodes/wot-scripting.js')
const helper = require('node-red-node-test-helper')
const coap = require('coap')
const url = require('uri-js')
const testTD = require('./test.td.json')

let coapServer

describe('WoTScriptingNode', function () {
  beforeEach(function (done) {
    coapServer = coap.createServer()
    coapServer.listen(5683)
    helper.startServer(done)
  })

  afterEach(function (done) {
    helper.unload().then(function () {
      coapServer.close()
      helper.stopServer(done)
    })
  })

  it('should be able to read properties', function (done) {
    const flow = [
      {
        id: 'n1',
        type: 'wot-scripting',
        operationType: 'readProperty',
        affordanceName: 'status',
        filterMode: 'affordanceName',
        msgOrContext: 'msg',
        wires: [['n2']]
      },
      {
        id: 'n2',
        type: 'end-test-node',
        name: 'end-test-node'
      }
    ]

    function endTestNode (RED) {
      function EndTestNode (n) {
        RED.nodes.createNode(this, n)
        this.on('input', function (msg) {
          msg.payload
            .should.eql('on')
          done()
        })
      }
      RED.nodes.registerType(
        'end-test-node',
        EndTestNode
      )
    }

    coapServer.on('request', function (req, res) {
      const path = url.parse(req.url).path

      req.method.should.eql('GET')
      path.should.eql('/status')
      res.setOption('Content-Format', 'application/json')
      res.end(JSON.stringify('on'))
    })

    const testNodes = [WoTScriptingNode, endTestNode]
    helper.load(testNodes, flow, function () {
      const n1 = helper.getNode('n1')
      n1.emit('input', { thingDescription: testTD })
    })
  })

  it('should be able to invoke actions', function (done) {
    const flow = [
      {
        id: 'n1',
        type: 'wot-scripting',
        operationType: 'invokeAction',
        filterMode: '@type',
        affordanceType: 'test:toggle',
        msgOrContext: 'msg',
        wires: [['n2']]
      },
      {
        id: 'n2',
        type: 'end-test-node',
        name: 'end-test-node'
      }
    ]

    function endTestNode (RED) {
      function EndTestNode (n) {
        RED.nodes.createNode(this, n)
        this.on('input', function (msg) {
          msg.payload
            .should.eql('on')
          done()
        })
      }
      RED.nodes.registerType(
        'end-test-node',
        EndTestNode
      )
    }

    coapServer.on('request', function (req, res) {
      const path = url.parse(req.url).path

      req.method.should.eql('POST')
      path.should.eql('/toggle')
      res.setOption('Content-Format', 'application/json')
      res.end(JSON.stringify('on'))
    })

    const testNodes = [WoTScriptingNode, endTestNode]
    helper.load(testNodes, flow, function () {
      const n1 = helper.getNode('n1')
      n1.emit('input', { thingDescription: testTD })
    })
  })
})
