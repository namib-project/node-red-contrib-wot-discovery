module.exports = function (RED) {
    "use strict";
    const { Servient } = require("@node-wot/core");
    const { HttpClientFactory } = require('@node-wot/binding-http');
    const { CoapClientFactory } = require('@node-wot/binding-coap');
    const { MqttClientFactory } = require('@node-wot/binding-mqtt');

    const operationsToAffordanceType = {
        readProperty: "properties",
        writeProperty: "properties",
        observeProperty: "properties",
        invokeAction: "actions",
        subscribeEvent: "events",
    };

    const thingCache = {};

    function WoTScriptingNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on('input', function (msg) {

            const operationType = config.operationType || msg.operationType;
            const affordanceName = config.affordanceName || msg.affordanceName;
            const type = config.affordanceType || msg.affordanceType;
            const inputValue = msg.payload || config.inputValue;
            const outputVar = msg.outputVar || config.outputVar || "payload";
            const outputPayload = config.outputPayload;
            const outputVarType = msg.outputVarType || config.outputVarType || "msg";
            const cacheMinutes = config.cacheMinutes || 15;

            const affordanceType = operationsToAffordanceType[operationType];

            if (!affordanceType) {
                node.error("Illegal operation type defined!");
                return;
            }

            const thingDescription = msg.thingDescription;

            let foundAffordances = [];

            const affordances = thingDescription[affordanceType];

            const affordanceNames = Object.keys(affordances);

            if (config.filterMode !== "affordanceName") {
                affordanceNames.forEach(name => {
                    let affordanceTypes = [];
                    const affordance = affordances[name];
                    const types = affordance["@type"];
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

            const filterMode = config.filterMode;

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
                node.error(`Illegal filter mode "${filterMode}" defined!`);
                return;
            }

            const identifier = _getTDIdentifier(thingDescription);

            try {
                if (thingCache[identifier]) {
                    performOperationsOnThing(foundAffordances, thingCache[identifier].td, operationType, msg, inputValue, outputVar, outputVarType, outputPayload);
                    if (cacheMinutes) {
                        thingCache[identifier].timer.refresh();
                    }
                } else {
                    _getConsumedThing(thingDescription).then(
                        (consumedThing) => {
                            thingCache[identifier].td = consumedThing;
                            performOperationsOnThing(foundAffordances, consumedThing, operationType, msg, inputValue, outputVar, outputVarType, outputPayload);
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

        function performOperationsOnThing (foundAffordances, consumedThing, operationType, msg, inputValue, outputVar, outputVarType, outputPayload) {
            foundAffordances.forEach((affordance) => {
                performOperationOnThing(
                    consumedThing,
                    operationType,
                    affordance,
                    msg,
                    inputValue,
                    outputVar,
                    outputVarType,
                    outputPayload
                );
            });
        }

        // TODO: This signature has to be shortened
        function performOperationOnThing(thing, operationType, affordanceName, msg, inputValue, outputVar, outputVarType, outputPayload) {

            const thingDescription = thing.getThingDescription();
            switch (operationType) {
                case "readProperty":
                    thing.readProperty(affordanceName).then(output => {
                        _handleOutput(msg, output, outputVar, outputVarType, outputPayload);
                    }).catch(error => node.error(error));
                    break;
                case "writeProperty":
                    if (!inputValue) {
                        node.error("No input value given!");
                        return;
                    }
                    thing.writeProperty(affordanceName, inputValue).then(output => {
                        _handleOutput(msg, output, outputVar, outputVarType, outputPayload);
                    }).catch(error => node.error(error));
                    break;
                case "observeProperty":
                    thing.observeProperty(affordanceName).then(output => {
                        _handleOutput(msg, output, outputVar, outputVarType, outputPayload);
                    }).catch(error => node.error(error));
                    break;
                case "invokeAction": {
                    let invokedAction;
                    const constValue = _getConstValueInput(thingDescription, affordanceName);
                    if (constValue) {
                        invokedAction = thing.invokeAction(affordanceName, constValue);
                    }
                    else if (inputValue) {
                        invokedAction = thing.invokeAction(affordanceName, inputValue);
                    } else {
                        invokedAction = thing.invokeAction(affordanceName);
                    }
                    invokedAction.then(output => {
                        _handleOutput(msg, output, outputVar, outputVarType, outputPayload);
                    }).catch(error => node.error(error));
                    break;
                }
                case "subscribeEvent":
                    thing.subscribeEvent(affordanceName).then(output => {
                        _handleOutput(msg, output, outputVar, outputVarType, outputPayload);
                    }).catch(error => node.error(error));
                    break;

                default:
                    break;
            }
        }

        function _getConstValueInput(thingDescription, affordanceName) {
            try {
                const affordance = thingDescription.actions[affordanceName];
                return affordance.input.const;
            } catch (error) {
                return null;
            }
        }

        function _handleOutput(msg, output, outputVar, outputVarType, outputPayload) {
            if (typeof output !== "undefined") {
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
                if (outputPayload) {
                  msg.payload = output;
                }
            }
            node.send(msg);
        }

        function _getTDIdentifier(thingDescription) {
            const identifier =
                thingDescription.id ||
                thingDescription.base ||
                thingDescription.title;
            return identifier;
        }

        function _getConsumedThing(thingDescription) {
            return new Promise((resolve, reject) => {
                const servient = new Servient();
                servient.addClientFactory(new HttpClientFactory(null));
                servient.addClientFactory(new CoapClientFactory(null));
                servient.addClientFactory(new MqttClientFactory(null));

                servient.start().then((thingFactory) => {
                    const consumedThing = thingFactory.consume(thingDescription);
                    resolve(consumedThing);
                    const identifier = _getTDIdentifier(thingDescription);
                    thingCache[identifier] = {servient: servient};
                }).catch((err) => reject(err));
            });
        }
    }
    RED.nodes.registerType("wot-scripting", WoTScriptingNode);
};
