/* global window, document, StateMachine, StateMachineSteps, sequentialWorkflowDesigner */

let _designer;
let _cache = {};
let _cacheKeys = [];
let _manifests = {};

async function onRunClicked() {
	if (_designer.isReadonly()) {
		return;
	}
	if (!_designer.isValid()) {
		window.alert('The definition is invalid');
		return;
	}

	_designer.setIsReadonly(true);

	const definition = _designer.getDefinition();

	let session = undefined;
	const client = new G4Client();
	const automation = client.newAutomation(undefined, undefined);

	const stateMachine = new StateMachine(definition, {
		executeStep: async (step, data) => {
			// Convert the step to a rule and prepare the automation configuration.
			const rule = client.convertToRule(step);
			const rules = [rule];

			// Assign the rules to the first job of the first stage.
			automation.stages[0].jobs[0].rules = rules;

			// Set driver parameters based on the session.
			automation.driverParameters = session === undefined
				? automation.driverParameters
				: { driver: `Id(${session})` };

			// Invoke the automation asynchronously and wait for the result.
			const automationResult = await client.invokeAutomation(automation);

			// Extract session information from the result.
			const responseKey = Object.keys(automationResult)[0];
			session = Object.keys(automationResult[responseKey].sessions)[0];
		},

		executeIf: (step, data) => {
			var varName = step.properties['var'];
			//createVariableIfNeeded(varName, data);
			return data[varName] > step.properties['val'];
		},

		initLoopStep: (step, data) => {
			const varName = step.properties['var'];
			//createVariableIfNeeded(varName, data);
			data[varName] = step.properties['val'];
		},

		canReplyLoopStep: (step, data) => {
			const varName = step.properties['var'];
			return --data[varName] >= 0;
		},

		beforeStepExecution: (step, data) => {
			document.getElementById('variables').innerText = JSON.stringify(data, null, 2) + '\r\n';
			_designer.selectStepById(step.id);
			_designer.moveViewportToStep(step.id);
		},
		// onStepExecuted: (step, data) => {
		// 	document.getElementById('variables').innerText = JSON.stringify(data, null, 2) + '\r\n';
		// 	_designer.selectStepById(step.id);
		// 	_designer.moveViewportToStep(step.id);
		// },

		onFinished: () => {
			_designer.setIsReadonly(false);
		}
	});
	stateMachine.start();
}

/**
 * Initializes the workflow designer with manifests, groups, and configurations.
 *
 * @async
 * @returns {Promise<void>} A promise that resolves once the designer is initialized.
 */
async function initializeDesigner() {
	// Create a new G4Client instance.
	const g4Cliet = new G4Client();

	// Fetch manifests and manifest groups from the G4Client.
	const manifests = await g4Cliet.getManifests();
	const manifestsGroups = await g4Cliet.getGroups();

	// Store the manifests and groups in global variables for later use.
	_manifests = manifests;

	// Store the cache in a global variable for later use.
	_cache = await g4Cliet.getCache();

	// Store the cache keys in a global variable for later use.
	_cacheKeys = Object.keys(_cache).map(key => key.toUpperCase());

	// Get the HTML element where the designer will be rendered.
	const designerHtmlElement = document.getElementById('designer');

	// Initialize the workflow's starting definition with the "WriteLog" manifest.
	const initalState = initializeStartDefinition(manifests["WriteLog"]);

	// Create a new start definition object.
	const startDefinition = newStartDefinition(initalState);

	// Initialize a new configuration for the workflow designer.
	const configuration = newConfiguration();

	// Initialize an array to hold all groups.
	const groups = [];

	// Process each manifest group to create the groups for the designer.
	for (const [groupName, manifestsGroup] of Object.entries(manifestsGroups)) {
		// Retrieve the manifests from the group, or default to an empty array.
		const manifests = manifestsGroup.manifests ? manifestsGroup.manifests : [];

		// Create a group object with its name and steps.
		const group = {
			name: groupName,
			steps: []
		};

		// Convert each manifest into a step and add it to the group.
		for (const manifest of manifests) {
			const step = StateMachineSteps.newG4Step(manifest);
			group.steps.push(step);
		}

		// Add the group to the array of groups.
		groups.push(group);
	}

	// Retrieve or create the "Containers" group in the configuration toolbox.
	let containers = groups.find(group => group.name === 'Containers');
	let containersGroup = containers ? containers : { name: 'Containers', steps: [] };

	// Create default container types for "Stage" and "Job".
	const stage = StateMachineSteps.newG4Stage('Stage', {}, {}, []);
	const job = StateMachineSteps.newG4Job('Job', {}, {}, []);

	// Add the containers to the "Containers" group.
	containersGroup.steps.push(...[stage, job]);

	// If "Containers" group doesn't exist, add it to the groups array.
	if (!containers) {
		groups.push(containersGroup);
	}

	// Sort groups alphabetically by name.
	let sortedGroups = groups.sort((a, b) => a.name.localeCompare(b.name));

	// Sort steps within each group alphabetically by name.
	for (const group of sortedGroups) {
		let sortedSteps = group.steps.sort((a, b) => a.name.localeCompare(b.name));
		group.steps = sortedSteps;
	}

	// Update the configuration toolbox with the sorted groups.
	configuration.toolbox.groups = sortedGroups;

	// Create the workflow designer using the configuration and start definition.
	_designer = sequentialWorkflowDesigner.Designer.create(designerHtmlElement, startDefinition, configuration);

	// Attach an event listener to the "Run" button for executing workflows.
	document.getElementById('run').addEventListener('click', onRunClicked);
}

/**
 * Initializes the default start definition for a state machine workflow.
 *
 * @param {Object} manifest - The manifest object containing necessary metadata for the state machine steps.
 * @returns {Array} An array containing the top-level container (`stage`) with its nested structure.
 */
function initializeStartDefinition(manifest) {
	// Create the initial step using the manifest.
	let initialStep = StateMachineSteps.newG4Step(manifest);

	// Set a default value for the "Argument" property of the initial step.
	initialStep.properties["Argument"]["value"] = "Foo Bar";

	// Create a job container with the initial step inside.
	// 'G4™ Default Job' is the name, 'job' is the type, an empty object represents additional properties, and `[initialStep]` is the list of steps.
	let job = StateMachineSteps.newG4Job('G4™ Default Job', {}, {}, [initialStep]);

	// Create a stage container with the job inside.
	// 'G4™ Default Stage' is the name, 'stage' is the type, and `[job]` represents the nested structure.
	let stage = StateMachineSteps.newG4Stage('G4™ Default Stage', {}, {}, [job]);

	// Return the stage as an array, as the function expects to return a list of containers.
	return [stage];
}

function newConfiguration() {
	return {
		undoStackSize: 5,

		toolbox: {
			groups: [],

			// Custom item template function
			itemProvider: (step) => {
				const item = document.createElement('div');
				item.className = 'sqd-toolbox-item';

				// Set the tooltip using the 'title' attribute
				if (step.description) {
					item.title = step.description;
				}

				// Create the icon element
				const icon = document.createElement('img');
				icon.className = 'sqd-toolbox-item-icon';
				icon.src = newConfiguration.steps.iconUrlProvider(step.componentType, step.type);

				// Create the name element
				const name = document.createElement('div');
				name.className = 'sqd-toolbox-item-name';
				name.textContent = step.name;

				// Append the icon and name to the item container
				item.appendChild(icon);
				item.appendChild(name);

				return item;
			}
		},

		steps: {
			iconUrlProvider: (componentType, type) => {
				const supportedIcons = ['if', 'loop', 'text', 'job', 'stage'];
				const fileName = supportedIcons.includes(type) ? type : 'task';
				return `./images/icon-${fileName}.svg`;
			},
			// canInsertStep: (step, _, container, a, b, c, d) => {
			// 	var a = designer;
			// 	var b = "";
			// }
		},

		validator: {
			step: step => {
				return Object.keys(step.properties).every(n => !!step.properties[n]);
			},
			root: definition => {
				return definition.properties['speed'] > 0;
			}
		},

		editors: {
			rootEditorProvider,
			stepEditorProvider
		},

		controlBar: true
	};
}

/**
 * Creates a new start definition object for a workflow with default properties.
 *
 * @param {Array} sequence - The sequence of steps or containers to include in the start definition.
 * @returns {Object} An object representing the start definition, containing default properties and the provided sequence.
 */
function newStartDefinition(sequence) {
	//const manifest = {};
	//var step = StateMachineSteps.newG4Step(_manifests["WriteLog"]);

	return {
		id: uid(),
		// Default properties for the start definition.
		properties: {
			speed: 300 // Default speed value (can be adjusted as needed).
		},
		// The provided sequence of steps or containers.
		sequence
	};
}

/**
 * Provides an editor interface for the root configuration of the workflow.
 *
 * @param {Object}  definition    - The definition object containing the properties and settings for the workflow.
 * @param {Object}  editorContext - Context object for notifying changes to the editor.
 * @param {boolean} isReadonly    - Flag indicating if the editor should be in read-only mode.
 * @returns {HTMLElement} A container element housing the root editor fields.
 */
function rootEditorProvider(definition, editorContext, isReadonly) {
	// Create the main container div element for the root editor.
	const container = document.createElement('div');
	container.setAttribute("g4-role", "root-editor");

	// Add a title to the container to indicate the configuration section.
	CustomFields.newTitle({
		container: container,
		helpText: 'Configure the automation settings for the flow.',
		subTitleText: 'Flow Configuration',
		titleText: 'Automation Settings'
	});

	// Add a string input field for configuring the "Invocation Interval".
	CustomFields.newStringField(
		{
			container: container,
			initialValue: definition.properties['speed'],
			isReadonly: isReadonly,
			label: 'Invocation Interval (ms)',
			title: 'Time between each action invocation'
		},
		(value) => {
			// Update the "speed" property with the new value from the input.
			definition.properties['speed'] = parseInt(value, 10); // Ensure the value is an integer.
			editorContext.notifyPropertiesChanged();
		}
	);

	// Add an authentication field for providing G4 credentials to allow automation requests.
	CustomG4Fields.newAuthenticationField(
		{
			container: container,
			label: "Authentication",
			title: "Provide G4™ credentials to allow automation requests.",
			initialValue: definition.properties['authentication']
		},
		(value) => {
			// Ensure the "authentication" property exists in the definition.
			definition.properties['authentication'] = definition.properties['authentication'] || {};

			// Update the "authentication" property with the new values from the input.
			for (const key of Object.keys(value)) {
				definition.properties['authentication'][key] = value[key];
			}

			// Notify the editor of the updated properties.
			editorContext.notifyPropertiesChanged();
		}
	);

	// Add a data source field for configuring the G4 data source settings.
	CustomG4Fields.newDataSourceField(
		{
			container: container,
			label: "Data Source",
			title: "Provide G4™ data source to configure the automation.",
			initialValue: definition.properties['dataSource']
		},
		(value) => {
			// Ensure the "dataSource" property exists in the definition.
			definition.properties['dataSource'] = definition.properties['dataSource'] || {};

			// Update the "dataSource" property with the new values from the input.
			for (const key of Object.keys(value)) {
				definition.properties['dataSource'][key] = value[key];
			}

			// Notify the editor of the updated properties.
			editorContext.notifyPropertiesChanged();
		}
	);

	// Add a driver parameters field for configuring the G4 driver parameters.
	CustomG4Fields.newDriverParametersField(
		{
			container: container,
			label: "Driver Parameters",
			title: "Provide G4™ driver parameters to configure the automation.",
			initialValue: definition.properties['driverParameters']
		},
		/**
		 * Callback function to handle updates to the Driver Parameters field.
		 *
		 * This function processes the input `value` and updates the `definition.properties`
		 * accordingly. It ensures that the `capabilities` structure is correctly maintained
		 * and merges new values into existing configurations. After processing, it notifies
		 * the editor that properties have changed.
		 *
		 * @param {Object} value - The updated Driver Parameters provided by the user.
		 */
		(value) => {
			// Ensure the 'driverParameters' property exists in the definition.
			definition.properties['driverParameters'] = definition.properties['driverParameters'] || {};

			// Ensure the 'capabilities' object exists within 'driverParameters'.
			definition.properties['driverParameters']['capabilities'] = definition.properties['driverParameters']['capabilities'] || {};

			// Ensure the 'firstMatch' object exists within 'capabilities'.
			definition.properties['driverParameters']['capabilities']['firstMatch'] = definition.properties['driverParameters']['capabilities']['firstMatch'] || {};

			// Ensure the 'vendorCapabilities' object exists within 'capabilities'.
			definition.properties['driverParameters']['capabilities']['vendorCapabilities'] = definition.properties['driverParameters']['capabilities']['vendorCapabilities'] || {};

			// Iterate over each key in the provided `value` object.
			for (const key of Object.keys(value)) {
				// Determine if the current key pertains to 'capabilities' with 'firstMatch'.
				const isFirstMatch = key.toLocaleUpperCase() === 'CAPABILITIES' && 'firstMatch' in value[key];

				// Determine if the current key pertains to 'capabilities' with 'alwaysMatch'.
				const isAlwaysMatch = key.toLocaleUpperCase() === 'CAPABILITIES' && 'alwaysMatch' in value[key];

				// Determine if the current key pertains to 'capabilities' with 'vendorCapabilities'.
				const isVendors = key.toLocaleUpperCase() === 'CAPABILITIES' && 'vendorCapabilities' in value[key];

				// Reference to the existing 'capabilities' object for easy access.
				const capabilities = definition.properties['driverParameters'].capabilities;

				if (isFirstMatch) {
					// Extract the 'firstMatch' object from the input value.
					const firstMatch = value[key].firstMatch;

					// Iterate over each group in 'firstMatch' and merge it into the existing capabilities.
					for (const group of Object.keys(firstMatch)) {
						capabilities['firstMatch'][group] = firstMatch[group];
					}

					// Continue to the next key as this one has been processed.
					continue;
				}

				if (isVendors) {
					// Extract the 'vendorCapabilities' object from the input value.
					const vendors = value[key].vendorCapabilities;

					// Iterate over each vendor in 'vendorCapabilities'.
					for (const vendor of Object.keys(vendors)) {
						// Iterate over each property for the current vendor.
						for (const property of Object.keys(vendors[vendor])) {
							// Ensure the vendor object exists within 'vendorCapabilities'.
							capabilities['vendorCapabilities'][vendor] = capabilities['vendorCapabilities'][vendor] || {};

							// Assign the property value to the corresponding vendor and property.
							capabilities['vendorCapabilities'][vendor][property] = vendors[vendor][property];
						}
					}

					// Continue to the next key as this one has been processed.
					continue;
				}

				if (isAlwaysMatch) {
					// Assign the 'alwaysMatch' object directly to the capabilities.
					capabilities['alwaysMatch'] = value[key].alwaysMatch;

					// Continue to the next key as this one has been processed.
					continue;
				}

				// For all other keys, assign the value directly to 'driverParameters'.
				definition.properties['driverParameters'][key] = value[key];
			}

			// Notify the editor that the properties have been updated.
			editorContext.notifyPropertiesChanged();
		}
	);

	// Add an automation settings field for configuring the automation settings.
	CustomG4Fields.newAutomationSettingsField(
		{
			container: container,
			label: "G4™ Automation Settings",
			title: "Provide G4™ automation settings to configure the automation.",
			initialValue: definition.properties['automationSettings']
		},
		(value) => {
			// Ensure the "automationSettings" property exists in the definition.
			definition.properties['automationSettings'] = definition.properties['automationSettings'] || {};

			// Update the "automationSettings" property with the new values from the input.
			for (const key of Object.keys(value)) {
				definition.properties['automationSettings'][key] = value[key];
			}

			// Notify the editor of the updated properties.
			editorContext.notifyPropertiesChanged();
		}
	);

	// Add an environment settings field for configuring the G4 environment settings.
	CustomG4Fields.newEnvironmentSettingsField(
		{
			container: container,
			label: "G4™ Environment Settings",
			title: "Provide G4™ environment settings to configure the automation.",
			initialValue: definition.properties['environmentSettings']
		},
		(value) => {
			// Ensure the "environmentSettings" property exists in the definition.
			definition.properties['environmentSettings'] = definition.properties['environmentSettings'] || {};

			// Update the "authentication" property with the new values from the input.
			for (const key of Object.keys(value)) {
				definition.properties['environmentSettings'][key] = value[key];
			}

			// Notify the editor of the updated properties.
			editorContext.notifyPropertiesChanged();
		}
	);

	// Add an exceptions settings field for configuring the G4 exceptions settings.
	CustomG4Fields.newExceptionsSettingsField(
		{
			container: container,
			label: "G4™ Exceptions Settings",
			title: "Provide G4™ exceptions settings to configure the automation.",
			initialValue: definition.properties['exceptionsSettings']
		},
		(value) => {
			// Ensure the "exceptionsSettings" property exists in the definition.
			definition.properties['exceptionsSettings'] = definition.properties['exceptionsSettings'] || {};

			// Update the "exceptionsSettings" property with the new values from the input.
			for (const key of Object.keys(value)) {
				definition.properties['exceptionsSettings'][key] = value[key];
			}

			// Notify the editor of the updated properties.
			editorContext.notifyPropertiesChanged();
		}
	);

	// Add a queue manager settings field for configuring the G4 queue manager settings.
	CustomG4Fields.newQueueManagerSettingsField(
		{
			container: container,
			label: "G4™ Queue Manager Settings",
			title: "Provide G4™ queue manager settings to configure the automation.",
			initialValue: definition.properties['queueManagerSettings']
		},
		(value) => {
			// Ensure the "queueManagerSettings" property exists in the definition.
			definition.properties['queueManagerSettings'] = definition.properties['queueManagerSettings'] || {};

			// Update the "queueManagerSettings" property with the new values from the input.
			for (const key of Object.keys(value)) {
				definition.properties['queueManagerSettings'][key] = value[key];
			}

			// Notify the editor of the updated properties.
			editorContext.notifyPropertiesChanged();
		}
	);

	// Add a performance points settings field for configuring the G4 performance points settings.
	CustomG4Fields.newPerformancePointsSettingsField(
		{
			container: container,
			label: "G4™ Performance Points Settings",
			title: "Provide G4™ performance points settings to configure the automation.",
			initialValue: definition.properties['performancePointsSettings']
		},
		(value) => {
			// Ensure the "performancePointsSettings" property exists in the definition.
			definition.properties['performancePointsSettings'] = definition.properties['performancePointsSettings'] || {};

			// Update the "performancePointsSettings" property with the new values from the input.
			for (const key of Object.keys(value)) {
				definition.properties['performancePointsSettings'][key] = value[key];
			}

			// Notify the editor of the updated properties.
			editorContext.notifyPropertiesChanged();
		}
	);

	// Add a plugins settings field for configuring the G4 plugins settings.
	CustomG4Fields.newPluginsSettingsField(
		{
			container: container,
			label: "G4™ Plugins Settings",
			title: "Provide G4™ plugins settings to configure the automation.",
			initialValue: definition.properties['pluginsSettings']
		},
		(value) => {
			// Initialize pluginsSettings if it doesn't exist
			definition.properties['pluginsSettings'] = definition.properties['pluginsSettings'] || {
				externalRepositories: {},
				forceRuleReference: false
			};

			// Reference to the current plugins settings
			const pluginsSettings = definition.properties['pluginsSettings'];

			// Get all keys from the incoming value
			const indexes = Object.keys(value) || [];

			// Iterate over each index in the incoming value
			for (const index of indexes) {
				const property = value[index];

				// If the property is not an object, set the pluginsSettings to the property
				if (!assertObject(property)) {
					pluginsSettings[index] = property;
					continue;
				}

				// If the property is null or undefined, delete the property from the definition
				// This is done to ensure that the property is not set to null or undefined
				// as it would be set to null or undefined in the definition
				if (!property) {
					delete value[index];
					continue;
				}

				// Iterate over each key within the current property
				for (const key of Object.keys(property)) {
					const propertyValue = property[key];
					const propertyKeys = Object.keys(propertyValue) || [];

					// Iterate over each property key to set the corresponding pluginsSettings
					for (const propertyKey of propertyKeys) {
						pluginsSettings[key] = pluginsSettings[key] || {};
						pluginsSettings[key][index] = pluginsSettings[key][index] || {};
						pluginsSettings[key][index][propertyKey] = property[key][propertyKey];
					}
				}
			}

			// Update the definition with the new plugins settings
			definition.properties['pluginsSettings'] = pluginsSettings;

			// Notify the editor that the properties have changed
			editorContext.notifyPropertiesChanged();
		}
	);

	// Add a screenshots settings field for configuring the G4 screenshots settings.
	CustomG4Fields.newScreenshotsSettingsField(
		{
			container: container,
			label: "G4™ Screenshots Settings",
			title: "Provide G4™ screenshots settings to configure the automation.",
			initialValue: definition.properties['screenshotsSettings']
		},
		(value) => {
			// Ensure the "screenshotsSettings" property exists in the definition.
			definition.properties['screenshotsSettings'] = definition.properties['screenshotsSettings'] || {};

			// Update the "screenshotsSettings" property with the new values from the input.
			for (const key of Object.keys(value)) {
				definition.properties['screenshotsSettings'][key] = value[key];
			}

			// Notify the editor of the updated properties.
			editorContext.notifyPropertiesChanged();
		}
	);

	// Return the fully constructed container with all added elements.
	return container;
}

/**
 * Provides a step editor UI component for a given plugin step.
 *
 * This function creates and configures the HTML structure necessary for editing a plugin step,
 * including sections for the plugin's name, properties, and parameters. It utilizes helper functions
 * from the `CustomFields` and other modules to generate form fields dynamically based on the
 * provided step's configuration.
 *
 * @param {Object} step          - The plugin step configuration object.
 * @param {Object} editorContext - The context object for the editor, used for notifying changes.
 * @param {Object} _definition   - Additional definition or metadata for the step (unused in this function).
 * @returns {HTMLElement} The fully populated step editor container element.
 */
function stepEditorProvider(step, editorContext, _definition) {
	/**
	 * Initializes and appends the appropriate input field to the container based on the parameter type.
	 *
	 * This function dynamically creates and configures input fields within a given container
	 * for either properties or parameters of a plugin step. It determines the type of the parameter
	 * and utilizes the corresponding `CustomFields` method to generate the appropriate input field.
	 * After creation, it sets up event listeners to handle value changes and notify the editor context.
	 *
	 * @param {HTMLElement} container - The DOM element that will contain the input field.
	 * @param {string}      key       - The key/name of the property or parameter.
	 * @param {Object}      step      - The plugin step object containing properties and parameters.
	 * @param {string}      type      - Specifies whether the field is a 'properties' or 'parameters' type.
	 */
	const initializeField = (container, key, step, type) => {
		// Initialize an empty parameter object to store the current parameter's properties.
		let parameter = {};

		// Retrieve the parameter object based on the type ('properties' or 'parameters').
		if (type === 'properties') {
			parameter = step.properties[key];
		} else if (type === 'parameters') {
			parameter = step.parameters[key];
		}

		// Determine the nature of the parameter to decide which input field to create.
		const isListField = _cacheKeys.includes(parameter.type.toUpperCase());
		const isOptionsField = parameter.optionsList && parameter.optionsList.length > 0;
		const isArray = parameter.type.toUpperCase() === 'ARRAY';
		const isSwitch = ['SWITCH', 'BOOLEAN', 'BOOL'].includes(parameter.type.toUpperCase());
		const isKeyValue = ['KEY/VALUE', 'KEYVALUE', 'DICTIONARY'].includes(parameter.type.toUpperCase());

		/**
		 * Handles the creation and configuration of a Key-Value input field.
		 * Updates the parameter value and notifies the editor context upon changes.
		 */
		if (isKeyValue) {
			CustomFields.newKeyValueField(
				{
					container: container,
					initialValue: parameter.value,
					label: key,
					title: parameter.description
				},
				(value) => {
					// Update the parameter's value with the new input.
					parameter.value = value;

					// Notify the editor context that properties have changed.
					editorContext.notifyPropertiesChanged();
				}
			);

			// Exit the function after creating the Key-Value field.
			return;
		}

		/**
		 * Handles the creation and configuration of a Switch (Boolean) input field.
		 * Updates the parameter value and notifies the editor context upon changes.
		 */
		if (isSwitch) {
			CustomFields.newSwitchField(
				{
					container: container,
					initialValue: parameter.value,
					label: key,
					title: parameter.description
				},
				(value) => {
					// Update the parameter's value based on the switch toggle.
					parameter.value = value;

					// Notify the editor context that properties have changed.
					editorContext.notifyPropertiesChanged();
				}
			);

			// Exit the function after creating the Switch field.
			return;
		}

		/**
		 * Handles the creation and configuration of an Array input field.
		 * Updates the parameter value and notifies the editor context upon changes.
		 */
		if (isArray) {
			CustomFields.newArrayField(
				{
					container: container,
					initialValue: parameter.value,
					label: key,
					title: parameter.description
				},
				(value) => {
					// Update the parameter's array value with the new input.
					parameter.value = value;

					// Notify the editor context that properties have changed.
					editorContext.notifyPropertiesChanged();
				}
			);

			// Exit the function after creating the Array field.
			return;
		}

		/**
		 * Handles the creation and configuration of a Data List (Dropdown) input field.
		 * Chooses between a list field or options field based on the parameter's properties.
		 * Updates the parameter value and notifies the editor context upon changes.
		 */
		if (isListField || isOptionsField) {
			const itemSource = isListField ? parameter.type : parameter.optionsList;
			CustomFields.newDataListField(
				{
					container: container,
					initialValue: parameter.value,
					itemSource: itemSource,
					label: key,
					title: parameter.description
				},
				(value) => {
					// Update the parameter's value based on the selected option.
					parameter.value = value;

					// Notify the editor context that properties have changed.
					editorContext.notifyPropertiesChanged();
				}
			);

			// Exit the function after creating the Data List field.
			return;
		}

		/**
		 * Handles the creation and configuration of a String input field.
		 * Defaults to this type if none of the above conditions are met.
		 * Updates the parameter value and notifies the editor context upon changes.
		 */
		CustomFields.newStringField(
			{
				container: container,
				initialValue: parameter.value,
				isReadonly: false,
				label: key,
				title: parameter.description
			},
			(value) => {
				// Update the parameter's string value with the new input.
				parameter.value = value;

				// Notify the editor context that properties have changed.
				editorContext.notifyPropertiesChanged();
			}
		);
	};

	// Generate a unique identifier for input elements within the editor.
	const inputId = newUid();

	// Escape the generated ID to ensure it's safe for use in CSS selectors.
	const escapedId = CSS.escape(inputId);

	// Create the main container element for the step editor.
	const stepEditorContainer = document.createElement('div');
	stepEditorContainer.setAttribute("g4-role", "step-editor");
	// Set the tooltip for the container to provide a description of the step.
	stepEditorContainer.title = step.description;

	/**
	 * Add a title section to the container.
	 * This includes the plugin's name converted from PascalCase to space-separated words,
	 * the plugin type as a subtitle, and a help text containing the step's description.
	 */
	CustomFields.newTitle({
		container: stepEditorContainer,
		titleText: convertPascalToSpaceCase(step.pluginName),
		subTitleText: step.pluginType,
		helpText: step.description
	});

	/**
	 * Add a name input field for the plugin.
	 * This field allows users to view and edit the name of the plugin.
	 * It is not read-only, enabling dynamic changes to the plugin's name.
	 */
	CustomFields.newNameField(
		{
			container: stepEditorContainer,
			initialValue: step.name,
			isReadonly: false,
			label: 'Plugin Name',
			title: 'The name of the plugin',
			step: step
		},
		(value) => {
			// Update the step's name with the new value entered by the user.
			step.name = value;

			// Notify the editor context that the plugin name has changed.
			editorContext.notifyNameChanged();
		}
	);

	/**
	 * Sort the properties of the step alphabetically for consistent display.
	 */
	const sortedProperties = Object.keys(step.properties).sort((a, b) => a.localeCompare(b));
	// Determine if the step has any parameters defined.
	const hasParameters = Object.keys(step.parameters).length > 0;

	/**
	 * Create a container for the Properties section.
	 * This container includes a label, role attribute, and a hint text explaining the purpose of properties.
	 */
	const propertiesFieldContainer = newMultipleFieldsContainer(`${inputId}`, {
		labelDisplayName: 'Properties',
		role: 'properties-container',
		hintText: 'Attributes that define the structural and operational behavior of the plugin.'
	});

	// Select the specific container within the Properties section where individual property fields will be added.
	const propertiesControllerContainer = propertiesFieldContainer.querySelector(`#${escapedId}-properties-container`);

	/**
	 * Iterate through each sorted property key to initialize corresponding input fields.
	 * Certain properties like 'Argument' and 'Rules' are conditionally skipped based on the presence of parameters.
	 */
	for (let index = 0; index < sortedProperties.length; index++) {
		// Retrieve the current property key from the sorted list.
		const key = sortedProperties[index];

		// Determine if the current property should be skipped.
		const skip = (hasParameters && key.toUpperCase() === 'ARGUMENT') || key.toUpperCase() === 'RULES';

		// Skip the property if it meets the conditions above.
		if (!skip) {
			initializeField(propertiesControllerContainer, key, step, "properties");
		}
	}

	/**
	 * Append the Properties section to the main container if there are any properties to display.
	 */
	if (sortedProperties.length > 0) {
		stepEditorContainer.appendChild(propertiesFieldContainer);
	}

	/**
	 * Sort the parameters of the step alphabetically for consistent display.
	 */
	const sortedParameters = Object.keys(step.parameters).sort((a, b) => a.localeCompare(b));

	/**
	 * Create a container for the Parameters section.
	 * This container includes a label, role attribute, and a hint text explaining the purpose of parameters.
	 */
	const parametersFieldContainer = newMultipleFieldsContainer(`${inputId}`, {
		labelDisplayName: 'Parameters',
		role: 'parameters-container',
		hintText: "Configurable inputs that customize and control the plugin's functionality."
	});

	// Select the specific container within the Parameters section where individual parameter fields will be added.
	const parametersControllerContainer = parametersFieldContainer.querySelector(`#${escapedId}-parameters-container`);

	/**
	 * Iterate through each sorted parameter key to initialize corresponding input fields.
	 */
	for (let index = 0; index < sortedParameters.length; index++) {
		// Retrieve the current parameter key from the sorted list.
		const key = sortedParameters[index];

		// Initialize the input field for the current parameter key.
		initializeField(parametersControllerContainer, key, step, "parameters");
	}

	/**
	 * Append the Parameters section to the main container if there are any parameters to display.
	 */
	if (sortedParameters.length > 0) {
		stepEditorContainer.appendChild(parametersFieldContainer);
	}

	/**
	 * Return the fully populated step editor container element.
	 * This element includes sections for the plugin's name, properties, and parameters.
	 */
	return stepEditorContainer;
}

// Initialize the designer when the window has loaded
window.addEventListener('load', () => {
	initializeDesigner();
});
