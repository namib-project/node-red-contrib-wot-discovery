const WoTDiscoveryNode = require('../nodes/wot-discovery.js')
const helper = require('node-red-node-test-helper')
const coap = require('coap')
const mqtt = require('mqtt')
const url = require('uri-js')

describe('WoTDiscoveryNode', function () {
  describe('CoAP Tests', function () {
    let coapServer

    beforeEach(function (done) {
      helper.startServer(done)
    })

    afterEach(function (done) {
      helper.unload().then(function () {
        if (coapServer) {
          coapServer.close()
        }
        helper.stopServer(done)
      })
    })

    const testIterationData = [
      {
        type: 'IPv4',
        coapUseIPv6: false
      }, {
        type: 'IPv6',
        coapUseIPv6: true
      }
    ]

    testIterationData.forEach(iterationData => {
      it(`should support ${iterationData.type} multicast discovery from /.well-known/core`, function (done) {
        const flow = [
          {
            id: 'n1',
            type: 'wot-discovery',
            useCoap: true,
            coreURI: true,
            tdURI: false,
            coapUseIPv4: !iterationData.coapUseIPv6,
            coapUseIPv6: iterationData.coapUseIPv6,
            coapIPv6Address: 'all',
            coapIPv4Address: 'all',
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
            this.once('input', function (msg) {
              msg.thingDescription
                .should.eql({ blah: 'hi' }) // Not a valid TD yet...
              done()
            })
          }
          RED.nodes.registerType(
            'end-test-node',
            EndTestNode
          )
        }

        const settings = { reuseAddr: true }

        if (iterationData.type === 'IPv6') {
          // if (process.platform === 'darwin') {
          // FIXME: IPv6 multicast apparently does not work on macOS
          this.skip()
          // }

          settings.type = 'udp6'
          settings.multicastAddress = 'ff02::1'
          settings.multicastInterface = '::1'
        } else {
          settings.type = 'udp4'
          settings.multicastAddress = '224.0.0.1'
        }

        coapServer = coap.createServer(settings)

        coapServer.on('request', function (req, res) {
          const path = url.parse(req.url).path

          if (path === '/.well-known/core') {
            res.setOption('Content-Format', 'application/link-format')
            res.end('</test>;rt="wot.thing";ct=432')
          } else if (path === '/test') {
            res.setOption('Content-Format', 'application/td+json')
            const td = { blah: 'hi' }
            res.end(JSON.stringify(td))
          }
        })

        const testNodes = [WoTDiscoveryNode, endTestNode]
        helper.load(testNodes, flow, function () {
          const n1 = helper.getNode('n1')
          coapServer.listen(5683)
          n1.emit('input', { payload: null })
        })
      })

      it(`should support resource directory using ${iterationData.type}`, function (done) {
        const flow = [
          {
            id: 'n1',
            type: 'wot-discovery',
            useCoap: true,
            useCoreRD: true,
            coreRDUseIPv6: iterationData.coapUseIPv6,
            coreRDUseIPv4: !iterationData.coapUseIPv6,
            tdURI: false,
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
              msg.thingDescription
                .should.eql({ blah: 'hi' }) // Not a valid TD yet...
              done()
            })
          }
          RED.nodes.registerType(
            'end-test-node',
            EndTestNode
          )
        }

        const settings = { reuseAddr: true }

        if (iterationData.type === 'IPv6') {
          // if (process.platform === 'darwin') {
          // FIXME: IPv6 multicast apparently does not work on macOS
          this.skip()
          // }

          settings.type = 'udp6'
          settings.multicastAddress = 'ff02::fe'
          settings.multicastInterface = '::1'
        } else {
          settings.type = 'udp4'
          settings.multicastAddress = '224.0.1.189'
        }

        coapServer = coap.createServer(settings)

        coapServer.on('request', function (req, res) {
          const parsedUrl = url.parse(req.url)

          if (parsedUrl.path === '/rd-lookup/res') {
            res.setOption('Content-Format', 'application/link-format')
            res.end('</test>;rt=wot.thing;ct=432')
          } else if (parsedUrl.query === 'rt=core.rd-lookup-res&ct=40') {
            res.setOption('Content-Format', 'application/link-format')
            res.end('</rd-lookup/res>;rt=core.rd-lookup-res;ct=40')
          } else if (parsedUrl.path === '/test') {
            res.setOption('Content-Format', 'application/td+json')
            const td = { blah: 'hi' }
            res.end(JSON.stringify(td))
          }
        })

        const testNodes = [WoTDiscoveryNode, endTestNode]
        helper.load(testNodes, flow, function () {
          const n1 = helper.getNode('n1')
          coapServer.listen(5683)
          n1.emit('input', { payload: null })
        })
      })
    })
  })

  describe('MQTT Tests', function () {
    // TODO: These tests should be mocked

    let mqttClient
    const brokerAddress = 'mqtt://test.mosquitto.org'

    beforeEach((done) => {
      mqttClient = mqtt.connect(brokerAddress)
      helper.startServer(done)
    })

    afterEach(function (done) {
      helper.unload().then(function () {
        if (mqttClient) {
          mqttClient.end()
        }
        helper.unload().then(() => {
          helper.stopServer(done)
        })
      })
    })

    // TODO: Fix MQTT test
    it.skip('should support discovery', function (done) {
      const flow = [
        {
          id: 'n1',
          type: 'wot-discovery',
          useMqtt: true,
          mqttBrokerAddress: brokerAddress,
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
            msg.thingDescription
              .should.eql({ blah: 'hi' }) // Not a valid TD yet...
            done()
          })
        }
        RED.nodes.registerType(
          'end-test-node',
          EndTestNode
        )
      }

      const testNodes = [WoTDiscoveryNode, endTestNode]
      helper.load(testNodes, flow, function () {
        const n1 = helper.getNode('n1')
        n1.emit('input', { payload: null })
        setTimeout(() => {
          mqttClient.publish('wot/td/smartlight', JSON.stringify({ blah: 'hi' }))
        }, 500)
      })
    }).timeout(5000)
  })
})
