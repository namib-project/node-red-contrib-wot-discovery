
var WoTDiscoveryNode = require("../nodes/wot-discovery.js");
var helper = require("node-red-node-test-helper");

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
        var flow = [
            {
                id: "n1",
                type: "wot-discovery",
            },
        ];
        //need to register nodes in order to use them
        var testNodes = [WoTDiscoveryNode];
        helper.load(testNodes, flow, function () {
            done();
        });
    });

});
