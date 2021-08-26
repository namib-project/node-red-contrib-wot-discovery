/**
 * Node-RED node that fetches WoT Thing Descriptions using CoAP(S) or HTTP(S).
 * @module node-red-contrib-wot-discovery/wot-fetch
 */

module.exports = function (RED) {
    const { Servient, Helpers } = require("@node-wot/core");
    const {
        HttpClientFactory,
        HttpsClientFactory,
    } = require("@node-wot/binding-http");
    const {
        CoapClientFactory,
        CoapsClientFactory,
    } = require("@node-wot/binding-coap");

    const servient = new Servient();
    servient.addClientFactory(new HttpClientFactory(null));
    servient.addClientFactory(new HttpsClientFactory(null));
    servient.addClientFactory(new CoapClientFactory(null));
    servient.addClientFactory(new CoapsClientFactory(null));
    const WoTHelpers = new Helpers(servient);

    function WoTFetchNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.on("input", function (msg) {
            const tdUrl = msg.tdUrl || config.tdUrl;
            const outputVar =
                msg.outputVar || config.outputVar || "thingDescription";
            const outputVarType =
                msg.outputVarType || config.outputVarType || "msg";

            node.status({
                fill: "blue",
                shape: "ring",
                text: `Fetching TD from ${tdUrl} ...`,
            });

            WoTHelpers.fetch(tdUrl)
                .then(async (td) => {
                    switch (outputVarType) {
                        case "msg":
                            msg[outputVar] = td;
                            node.send(msg);
                            break;
                        case "flow":
                        case "global":
                            node.context()[outputVarType].set(outputVar, td);
                            break;
                        default:
                            throw new Error(
                                "Wrong output variable type defined."
                            );
                    }

                    node.status({
                        fill: "green",
                        shape: "ring",
                        text: "Success!",
                    });
                })
                .catch((err) => {
                    node.error("Fetch error:", err);
                    node.status({
                        fill: "red",
                        shape: "ring",
                        text: `Error fetching TD from ${tdUrl}`,
                    });
                });
        });
    }
    RED.nodes.registerType("wot-fetch", WoTFetchNode);
};
