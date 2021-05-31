const WoTScriptingNode = require("../nodes/wot-scripting.js");
const helper = require("node-red-node-test-helper");

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
                type: "wot-scripting",
                "affordanceName": "temperature",
                "affordanceType": "readProperty",
            },
        ];
        //need to register nodes in order to use them
        const testNodes = [WoTScriptingNode];
        helper.load(testNodes, flow, function () {
            done();
        });
    });

    it("should do something", function (done) {
        const flow = [];

        //need to register nodes in order to use them
        const testNodes = [];
        helper.load(testNodes, flow, function () {
            done();
        });
    });

});
