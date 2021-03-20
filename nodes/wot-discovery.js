module.exports = function(RED) {
    "use strict";
    var coap = require("coap");
    var url = require("uri-js");

    function WoTDiscoveryNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        var multicastReponse = null;
        var reqOpts = url.parse("coap://[ff02::1]/.well-known/wot-thing-description");
        reqOpts.method = "GET";
        // reqOpts.headers = {};
        // reqOpts.headers["Content-Format"] = "application/json";
        reqOpts.multicast = true;


        node.on('input', function(msg) {
            var req = coap.request(reqOpts);
            req.on("response", _onResponse);
            req.on("error", function (err) {
                node.log("client error");
                node.log(err);
            });

            // msg.payload = msg.payload.toLowerCase();
            // node.send(msg);
        });

        function _onResponse(res) {
            multicastReponse = res;
            res.on("data", data => {
                if (res.headers["Content-Format"] === "application/json") {
                    try {
                        var payload = JSON.parse(data.toString());
                        node.send({payload: payload});
                    } catch (error) {
                        node.error(error.message);
                    }
                }
            });

        }
    }
    RED.nodes.registerType("wot-discovery", WoTDiscoveryNode);
}
