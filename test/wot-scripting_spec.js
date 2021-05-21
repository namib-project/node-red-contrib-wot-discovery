var WoTScriptingNode = require("../nodes/wot-scripting.js");
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
                type: "wot-scripting",
                "affordanceName": "temperature",
                "affordanceType": "readProperty",
            },
        ];
        //need to register nodes in order to use them
        var testNodes = [WoTScriptingNode];
        helper.load(testNodes, flow, function () {
            done();
        });
    });

    it("should do something", function (done) {
        var flow = [];

        //need to register nodes in order to use them
        var testNodes = [];
        helper.load(testNodes, flow, function () {
            done();
        });
    });

});
