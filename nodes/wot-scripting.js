module.exports = function (RED) {
    "use strict";
    const { Servient, Helpers } = require("@node-wot/core");
    const { HttpClientFactory } = require('@node-wot/binding-http');
    const { CoapClientFactory } = require('@node-wot/binding-coap');
    const { MqttClientFactory } = require('@node-wot/binding-mqtt');

    const operationsToAffordanceType = {
        readProperty: "properties",
        writeProperty: "properties",
        observeProperty: "properties",
        invokeAction: "actions",
        subscribeEvent: "events",
    }

    var thingCache = {};

    function WoTScriptingNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.on('input', function (msg) {

            var operationType = config.operationType || msg.operationType;
            var affordanceName = config.affordanceName || msg.affordanceName;
            var type = config.affordanceType || msg.affordanceType;
            var inputValue = msg.payload || config.inputValue;
            var outputVar = msg.outputVar || config.outputVar || "payload";
            var outputVarType = msg.outputVarType || config.outputVarType || "msg";
            var cacheMinutes = config.cacheMinutes || 15;

            var affordanceType = operationsToAffordanceType[operationType];

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
                    if (typeof (types) === 'string') {
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

            let identifier = _getTDIdentifier(thingDescription);

            try {
                if (thingCache[identifier]) {
                    performOperationsOnThing(foundAffordances, thingCache[identifier].td, operationType, msg, inputValue, outputVar, outputVarType);
                    if (cacheMinutes) {
                        thingCache[identifier].timer.refresh();
                    }
                } else {
                    _getConsumedThing(thingDescription).then(
                        (consumedThing) => {
                            thingCache[identifier].td = consumedThing;
                            performOperationsOnThing(foundAffordances, consumedThing, operationType, msg, inputValue, outputVar, outputVarType);
                            if (cacheMinutes) {
                                thingCache[identifier].timer = setTimeout(() => {
                                    thingCache[identifier].servient.shutdown();
                                    delete thingCache[identifier];
                                }, cacheMinutes * 60 * 1000);
                            }
                        }
                    );
                }
            } catch (error) {
                console.log(error);
                node.error("Error:", error.message);
            }
        });

        function performOperationsOnThing (foundAffordances, consumedThing, operationType, msg, inputValue, outputVar, outputVarType) {
            foundAffordances.forEach((affordance) => {
                performOperationOnThing(
                    consumedThing,
                    operationType,
                    affordance,
                    msg,
                    inputValue,
                    outputVar,
                    outputVarType,
                );
            });
        }

        // TODO: This signature has to be shortened
        function performOperationOnThing(thing, operationType, affordanceName, msg, inputValue, outputVar, outputVarType) {

            let thingDescription = thing.getThingDescription();
            switch (operationType) {
                case "readProperty":
                    thing.readProperty(affordanceName).then(output => {
                        _handleOutput(msg, output, outputVar, outputVarType);
                    }).catch(error => node.error(error));
                    break;
                case "writeProperty":
                    if (!inputValue) {
                        node.error("No input value given!");
                        return;
                    }
                    thing.writeProperty(affordanceName, inputValue).then(output => {
                        _handleOutput(msg, output, outputVar, outputVarType);
                    }).catch(error => node.error(error));
                    break;
                case "observeProperty":
                    thing.observeProperty(affordanceName).then(output => {
                        _handleOutput(msg, output, outputVar, outputVarType);
                    }).catch(error => node.error(error));
                    break;
                case "invokeAction":
                    let invokedAction;
                    let constValue = thingDescription.actions?.[affordanceName]?.input?.const;
                    if (constValue) {
                        invokedAction = thing.invokeAction(affordanceName, constValue);
                    }
                    else if (inputValue) {
                        invokedAction = thing.invokeAction(affordanceName, inputValue);
                    } else {
                        invokedAction = thing.invokeAction(affordanceName);
                    }
                    invokedAction.then(output => {
                        _handleOutput(msg, output, outputVar, outputVarType);
                    }).catch(error => node.error(error));
                    break;
                case "subscribeEvent":
                    thing.subscribeEvent(affordanceName).then(output => {
                        _handleOutput(msg, output, outputVar, outputVarType);
                    }).catch(error => node.error(error));
                    break;

                default:
                    break;
            }
        }

        function _handleOutput(msg, output, outputVar, outputVarType) {
            if (output) {
                if (outputVarType === "msg") {
                    msg[outputVar] = output;
                } else if (outputVarType === "flow") {
                    node.context().flow.set(outputVar, output);
                    console.log(`Putting ${output} into ${outputVar} of ${outputVarType}`);
                } else if (outputVarType === "global") {
                    node.context().global.set(outputVar, output);
                    console.log(`Putting ${output} into ${outputVar} of ${outputVarType}`);
                } else {
                    throw Error("Invalid output context given! Possible values are msg, flow or global!");
                }
            }
            node.send(msg);
        }

        function _getTDIdentifier(thingDescription) {
            let identifier =
                thingDescription.id ||
                thingDescription.base ||
                thingDescription.title;
            return identifier;
        }

        async function _getConsumedThing(thingDescription) {
            return new Promise((resolve, reject) => {
                let servient = new Servient();
                servient.addClientFactory(new HttpClientFactory(null));
                servient.addClientFactory(new CoapClientFactory(null));
                servient.addClientFactory(new MqttClientFactory(null));

                servient.start().then((thingFactory) => {
                    let consumedThing = thingFactory.consume(thingDescription);
                    resolve(consumedThing);
                    let identifier = _getTDIdentifier(thingDescription);
                    thingCache[identifier] = {servient: servient};
                });
            });
        }
    }
    RED.nodes.registerType("wot-scripting", WoTScriptingNode);
}
