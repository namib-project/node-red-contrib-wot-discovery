const WoTDiscoveryNode = require("../nodes/wot-discovery.js");
const helper = require("node-red-node-test-helper");
const coap = require("coap");
const url = require("uri-js");

describe("WoTScriptingNode", function () {
    beforeEach(function (done) {
        helper.startServer(done);
    });

    afterEach(function (done) {
        helper.unload().then(function () {
            helper.stopServer(done);
        });
    });

    it("should be loaded", function (done) {
        const flow = [
            {
                id: "n1",
                type: "wot-discovery",
            },
        ];
        //need to register nodes in order to use them
        const testNodes = [WoTDiscoveryNode];
        helper.load(testNodes, flow, function () {
            done();
        });
    });

    describe("CoAP Discovery", function () {

        it("should support multicast discovery from /.well-known/core", function (done) {
            const flow = [
                {
                    id: "n1",
                    type: "wot-discovery",
                    useCoap: true,
                    coreURI: true,
                    tdURI: false,
                    coapUseIPv6: true,
                    coapIPv6Address: "all",
                    msgOrContext: "msg",
                    wires: [["n2"]],
                },
                {
                    id: "n2",
                    type: "end-test-node",
                    name: "end-test-node",
                },
            ];

            function endTestNode(RED) {
                function EndTestNode(n) {
                    RED.nodes.createNode(this, n);
                    this.on("input", function (msg) {
                        msg.thingDescription
                            .should.eql({blah: "hi"}); // Not a valid TD yet...
                        done();
                    });
                }
                RED.nodes.registerType(
                    "end-test-node",
                    EndTestNode
                );
            }

            const settings = {type: "udp6", reuseAddr: true, multicastAddress: "ff02::1", multicastInterface: "::1"};
            const server = new coap.createServer(settings);

            server.on('request', function(req, res) {
                const path = url.parse(req.url).path;

                if (path === "/.well-known/core") {
                    res.setOption("Content-Format", "application/link-format");
                    res.end('</test>;rt="wot.thing";ct=432');
                } else if (path === "/test") {
                    res.setOption("Content-Format", "application/json");
                    const td = {blah: "hi"};
                    res.end(JSON.stringify(td));
                }
              });

            const testNodes = [WoTDiscoveryNode, endTestNode];
            helper.load(testNodes, flow, function () {
                const n1 = helper.getNode("n1");
                server.listen(5683);
                n1.emit("input", {payload:null});
            });
        });

    });
});
