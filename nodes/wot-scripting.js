module.exports = function(RED) {
    "use strict";
    const { Servient, Helpers } = require("@node-wot/core");
    const { HttpClientFactory } = require('@node-wot/binding-http');
    const { CoapClientFactory } = require('@node-wot/binding-coap');
    const { MqttClientFactory } = require('@node-wot/binding-mqtt');

    const propertyOperations = ["readProperty", "writeProperty", "observeProperty",]

    const servient = new Servient();
    servient.addClientFactory(new HttpClientFactory(null));
    servient.addClientFactory(new CoapClientFactory(null));
    servient.addClientFactory(new MqttClientFactory(null));
    const WoTHelpers = new Helpers(servient);

    function WoTScriptingNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;


        node.on('input', function(msg) {

            var operationType = config.operationType || msg.operationType;
            var affordanceName = config.affordanceName || msg.affordanceName;
            var type = config.affordanceType || msg.affordanceType;
            var inputValue = msg.payload || config.inputValue;

            var affordanceType = propertyOperations.includes(operationType) ? "properties" : operationType == "invokeAction" ? "actions" : operationType == "subscribeEvent" ? "events" : null;

            if (!affordanceType) {
                node.error("Illegal operation type defined!");
                return;
            }

            var thingDescription = msg.thingDescription;

            var foundAffordances = []

            var affordances = thingDescription[affordanceType];

            const affordanceNames = Object.keys(affordances);

            if (config.filterMode !== "affordanceName") {
                affordanceNames.forEach((name, index) => {
                    let affordanceTypes = []
                    let affordance = affordances[name];
                    let types = affordance["@type"];
                    // TODO: Refactor string to array conversion
                    if (typeof(types) === 'string') {
                        affordanceTypes.push(types);
                    } else if (types instanceof Array) {
                        affordanceTypes = types;
                    } else {
                        return;
                    }
                    if (affordanceTypes.includes(type)) {
                        foundAffordances.push(affordanceName);
                    }
                });
            }

            let filterMode = config.filterMode;

            if (filterMode === "both") {
                if (foundAffordances.includes(affordanceName)) {
                    foundAffordances = [affordanceName];
                } else {
                    return;
                }
            } else if (filterMode === "affordanceName") {
                if (affordanceNames.includes(affordanceName)) {
                    foundAffordances = [affordanceName];
                } else {
                    return;
                }
            } else if (filterMode !== "@type") {
               node.error(`Illegal filter mode "${filtermode}" defined!`);
               return;
            }

            try {
                servient.start().then(async (WoT) => {
                    let thing = await WoT.consume(thingDescription);

                    foundAffordances.forEach(affordance => {
                        performOperationOnThing(thing, operationType, affordance, msg, inputValue);
                    });
                });
            }
            catch (err) {
                node.error("Script error:", err);
            }
        });

        function performOperationOnThing(thing, operationType, affordanceName, msg, inputValue) {

                    switch (operationType) {
                        case "readProperty":
                            thing.readProperty(affordanceName).then(property => {
                                msg.payload = property;
                                node.send(msg);
                            }).catch(error => node.error(error));
                            break;
                        case "writeProperty":
                            if (!inputValue) {
                                node.error("No input value given!");
                                return;
                            }
                            thing.writeProperty(affordanceName, inputValue).then(property => {
                                msg.payload = property;
                                node.send(msg);
                            }).catch(error => node.error(error));
                            break;
                        case "observeProperty":
                            thing.observeProperty(affordanceName).then(property => {
                                msg.payload = property;
                                node.send(msg);
                            }).catch(error => node.error(error));
                            break;
                        case "invokeAction":
                            let invokedAction;
                            if (inputValue) {
                                invokedAction = thing.invokeAction(affordanceName, inputValue);
                            } else {
                                invokedAction = thing.invokeAction(affordanceName);
                            }
                            invokedAction.then(property => {
                                msg.payload = property;
                                node.send(msg);
                            }).catch(error => node.error(error));
                            break;
                        case "subscribeEvent":
                            thing.subscribeEvent(affordanceName).then(property => {
                                msg.payload = property;
                                node.send(msg);
                            }).catch(error => node.error(error));
                            break;
                    
                        default:
                            break;
                    }
        }

    }
    RED.nodes.registerType("wot-scripting", WoTScriptingNode);
}
