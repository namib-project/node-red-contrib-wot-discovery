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

    const statusClearingDelay = 5000;
    const tdCacheTime = 15 * 60 * 1000; // TODO: Should be configurable

    const wotHelper = _createWoTHelper();

    function WoTFetchNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        let clearingTimeout;
        const tdCache = {};

        node.status({});

        node.on("input", function (msg) {
            const tdUrl = msg.tdUrl || config.tdUrl;
            const outputVar =
                msg.outputVar || config.outputVar || "thingDescription";
            const outputVarType =
                msg.outputVarType || config.outputVarType || "msg";

            if (tdCache[tdUrl] != undefined) {
                _setStatusTimeout();
                node.status({
                    fill: "green",
                    shape: "ring",
                    text: `Used cached TD for ${tdUrl}`,
                });
                _handleTd(tdCache[tdUrl]);
            } else {
                _fetchTd();
            }

            function _fetchTd() {
                node.status({
                    fill: "blue",
                    shape: "dot",
                    text: `Fetching TD from ${tdUrl}`,
                });

                wotHelper.fetch(tdUrl)
                    .then(async (td) => {
                        _handleTd(td);
                        _cacheTd(tdUrl, td);
                        _setStatusTimeout();
                        node.status({
                            fill: "green",
                            shape: "ring",
                            text: "Success!",
                        });
                    })
                    .catch((err) => {
                        node.error("Fetch error:", err);
                        _setStatusTimeout();
                        node.status({
                            fill: "red",
                            shape: "ring",
                            text: `Error fetching TD from ${tdUrl}`,
                        });
                    });
            }

            function _handleTd(td) {
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
                        throw new Error("Wrong output variable type defined.");
                }
            }
        });

        function _cacheTd(tdUrl, td) {
            tdCache[tdUrl] = td;
            setTimeout(() => {
                delete tdCache[tdUrl];
            }, tdCacheTime);
        }

        function _setStatusTimeout() {
            clearTimeout(clearingTimeout);

            clearingTimeout = setTimeout(() => {
                node.status({});
            }, statusClearingDelay);
        }
    }

    function _createWoTHelper() {
        const servient = new Servient();
        servient.addClientFactory(new HttpClientFactory(null));
        servient.addClientFactory(new HttpsClientFactory(null));
        servient.addClientFactory(new CoapClientFactory(null));
        servient.addClientFactory(new CoapsClientFactory(null));
        return new Helpers(servient);
    }

    RED.nodes.registerType("wot-fetch", WoTFetchNode);
};
