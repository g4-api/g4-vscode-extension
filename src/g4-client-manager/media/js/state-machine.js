/* global setTimeout */

/**
 * Generates a unique identifier (UID) as a hexadecimal string.
 *
 * @returns {string} A unique identifier generated by combining a random number and converting it to a hexadecimal string.
 */
function uid() {
	return Math.ceil(Math.random() * 10 ** 16).toString(16);
}

/**
 * Determines whether a given value is an object.
 *
 * This function checks if the provided value is an object, which includes
 * objects, arrays, and functions. It explicitly excludes `null` and all
 * primitive types such as boolean, number, string, symbol, bigint, and undefined.
 *
 * @param {*} value - The value to be checked.
 * @returns {boolean} - Returns `true` if the value is an object, `false` if it's a primitive type.
 *
 * @example
 * assertObject({});            // returns true
 * assertObject([1, 2, 3]);     // returns true
 * assertObject(function() {}); // returns true
 * assertObject('Hello');       // returns false
 * assertObject(42);            // returns false
 * assertObject(true);          // returns false
 * assertObject(null);          // returns false
 * assertObject(undefined);     // returns false
 */
function assertObject(value) {
    // Exclude `null` since `typeof null` returns 'object', but it's a primitive.
    if (value === null) {
        return false;
    }

    // Check if the type of the value is 'object' or 'function'.
    // In JavaScript, functions are considered objects.
    return (typeof value === 'object' || typeof value === 'function');
}

/**
 * Converts a given string to camelCase.
 *
 * The function processes the input string by:
 * 1. Removing any non-alphanumeric separators (e.g., spaces, dashes, underscores).
 * 2. Capitalizing the first letter of each word except the first one.
 * 3. Ensuring the first character of the resulting string is in lowercase.
 *
 * @param {string} str - The input string to be converted to camelCase.
 * @returns {string} - The camelCase version of the input string. Returns 'N/A' if the input is falsy.
 *
 * @example
 * convertToCamelCase("Hello World"); // "helloWorld"
 * convertToCamelCase("convert_to_camel_case"); // "convertToCamelCase"
 * convertToCamelCase("Convert-This String"); // "convertThisString"
 * convertToCamelCase("alreadyCamelCase"); // "alreadyCamelCase"
 * convertToCamelCase(""); // "N/A"
 */
function convertToCamelCase(str) {
	// If the input string is falsy (e.g., null, undefined, empty), return 'N/A'.
	if (!str) {
		return 'N/A';
	}

	// Step 1: Replace any non-alphanumeric characters followed by a character with the uppercase of that character.
	// This removes separators and capitalizes the following letter.
	const camelCased = str.replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());

	// Step 2: Convert the first character to lowercase to adhere to camelCase conventions.
	return camelCased.charAt(0).toLowerCase() + camelCased.slice(1);
}

/**
 * Converts a PascalCase string to a space-separated string.
 *
 * @param {string} str - The PascalCase string to convert.
 * @returns {string} - The converted space-separated string.
 */
function convertPascalToSpaceCase(str) {
	return str ? str.replace(/([A-Z])/g, ' $1').trim() : 'N/A';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class StateMachine {
	isInterrupted = false;

	constructor(definition, handler) {
		this.definition = definition;
		this.speed = definition.properties["speed"];
		this.handler = handler;
		this.data = {};
		this.callstack = [
			{
				sequence: this.definition.sequence,
				index: 0,
				unwind: null
			}
		];
		this.isRunning = false;
	}

	async executeStep(step) {
		await this.handler.executeStep(step, this.data);
	}

	unwindStack() {
		this.callstack.pop();
	}

	executeIfStep(step) {
		const value = this.handler.executeIf(step, this.data);
		const branchName = value ? 'true' : 'false';

		this.callstack.push({
			sequence: step.branches[branchName],
			index: 0,
			unwind: this.unwindStack.bind(this)
		});
	}

	executeContainer(container) {
		//this.handler.initStage(stage, this.data);
		this.callstack.push({
			sequence: container.sequence,
			index: 0,
			unwind: this.unwindStack.bind(this)
		});
	}

	executeLoopStep(step) {
		this.handler.initLoopStep(step, this.data);

		const program = {
			sequence: step.sequence,
			index: 0,
			unwind: () => {
				if (this.handler.canReplyLoopStep(step, this.data)) {
					program.index = 0;
				} else {
					this.unwindStack();
				}
			}
		};
		this.callstack.push(program);
	}

	async execute() {
		if (this.isInterrupted) {
			this.handler.onInterrupted();
			return;
		}

		const depth = this.callstack.length - 1;
		const program = this.callstack[depth];

		if (program.sequence.length === program.index) {
			if (depth > 0) {
				program.unwind();
				this.execute();
			} else {
				this.isRunning = false;
				this.handler?.onFinished(this.data);
			}
			return;
		}

		const step = program.sequence[program.index];
		program.index++;

		if (this.handler.beforeStepExecution) {
			this.handler.beforeStepExecution(step, this.data);
		}

		switch (step.componentType) {
			case "container":
				this.executeContainer(step);
				break;
			case 'switch':
				this.executeIfStep(step);
				break;
			case 'loop':
				this.executeLoopStep(step);
				break;
			default:
				await this.executeStep(step);
				break;
		}

		if (this.handler.onStepExecuted) {
			this.handler.onStepExecuted(step, this.data);
		}
		setTimeout(this.execute.bind(this), this.speed);
	}

	start() {
		if (this.isRunning) {
			throw new Error('Already running');
		}
		this.isRunning = true;
		this.callstack[0].index = 0;
		this.execute();
	}

	interrupt() {
		if (!this.isRunning) {
			throw new Error('Not running');
		}
		this.isInterrupted = true;
	}
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class StateMachineSteps {
	static newG4Automation() {
		const authentication = {
			password: CustomFields.newStringField("Password", "The password for the G4 API.", "", true),
			username: CustomFields.newStringField("Username", "The username for the G4 API.", "", true)
		}

		const driverParameters = {

		}

		return {}
	}

	/**
	 * Creates a new Stage container for the G4 Automation Sequence.
	 * 
	 * A Stage is a container that holds Jobs, each comprising specific Actions, to structure and manage the sequential automation flow.
	 * Stages organize tasks into logical groups, enabling efficient execution, resource allocation, monitoring, and error handling within the automation sequence.
	 *
	 * @param {string} name       - The name of the Stage container.
	 * @param {Object} properties - The properties defining the Stage container.
	 * @param {Object} parameters - The parameters associated with the Stage.
	 * @param {Array}  steps      - The steps or actions that belong to the Stage.
	 * @returns {Object} A new Stage container object created by the newG4Container function.
	 */
	static newG4Stage(name, properties, parameters, steps) {
		// Description of the Stage container, detailing its purpose and functionalities within the G4 Automation Sequence.
		const stageDescription = `
        A container that holds jobs, each comprising specific actions, to structure and manage the sequential automation flow.
        Stages organize tasks into logical groups, enabling efficient execution, resource allocation, monitoring, and error handling within the automation sequence.
    `;

		// Initialize the Stage container using the newG4Container function.
		let container = StateMachineSteps.newG4Container(name, 'stage', stageDescription, properties, parameters, steps);
		container["pluginType"] = 'Container'
		container["pluginName"] = 'G4™ Stage'

		// Return the Stage container.
		return container;
	}

	/**
	 * Creates a new Job container within a Stage for the G4 Automation Sequence.
	 *
	 * A Job is a container that holds Actions, organizing and executing them as part of a Job within a Stage.
	 * Job containers manage specific tasks, handle dependencies between actions, coordinate execution,
	 * and ensure efficient resource utilization and error handling within the automation sequence.
	 * By encapsulating related actions, Job containers facilitate modularity, scalability, and maintainability,
	 * allowing complex automation workflows to be broken down into manageable and reusable components.
	 *
	 * @param {string} name       - The name of the Job container.
	 * @param {Object} properties - The properties defining the Job container.
	 * @param {Object} parameters - The parameters associated with the Job.
	 * @param {Array}  steps      - The steps or actions that belong to the Job.
	 * @returns {Object} A new Job container object created by the newG4Container function.
	 */
	static newG4Job(name, properties, parameters, steps) {
		// Description of the Job container, detailing its purpose and functionalities within the G4 Automation Sequence.
		const jobDescription = `
        A container that holds actions, organizing and executing them as part of a job within a stage.
        Job containers manage specific tasks, handle dependencies between actions, coordinate execution,
        and ensure efficient resource utilization and error handling within the automation sequence.
        By encapsulating related actions, job containers facilitate modularity, scalability, and maintainability,
        allowing complex automation workflows to be broken down into manageable and reusable components.
    `;

		// Initialize the Job container using the newG4Container function.
		let container = StateMachineSteps.newG4Container(name, 'job', jobDescription, properties, parameters, steps);
		container["pluginType"] = 'Container'
		container["pluginName"] = 'G4™ Job'

		// Return the Job container.
		return container;
	}

	/**
	 * Creates a new G4 container object for use in a workflow.
	 *
	 * @param {string} name        - The name of the container.
	 * @param {string} type        - The type of the container (e.g., "stage", "job").
	 * @param {string} description - A brief description of the container.
	 * @param {Object} properties  - An object containing properties for the container.
	 * @param {Object} parameters  - An object containing parameters for the container.
	 * @param {Array}  steps       - An array of steps or sub-containers to include in the container's sequence.
	 * @returns {Object} A new container object with a unique ID and specified properties.
	 */
	static newG4Container(name, type, description, properties, parameters, steps) {
		return {
			description: description || 'Description not provided.',
			id: uid(),                    // Generate a unique identifier for the container.
			componentType: 'container',   // Specify the component type as "container".
			type,                         // The type of the container (e.g., stage, job).
			name,                         // The name of the container.
			parameters: parameters || {}, // Parameters specific to the container.
			properties: properties || {}, // Properties specific to the container.
			sequence: steps || []         // The sequence of steps or sub-containers; defaults to an empty array.
		};
	}

	/**
	 * Creates a new G4 step based on the provided manifest.
	 *
	 * @param {Object} manifest - The manifest object containing properties and parameters.
	 * @returns {Object} The newly created G4 step object.
	 */
	static newG4Step(manifest) {
		// Function to convert PascalCase to space-separated words
		const convertPascalToSpaceCase = str => str.replace(/([A-Z])/g, ' $1').trim();

		// Creates a new bridge object from a G4 parameter object.
		const newBridgeObject = (g4ParameterObject) => {
			let bridgeObject = {
				description: g4ParameterObject.description.join('\n'),  // Set summary
				name: convertPascalToSpaceCase(g4ParameterObject.name), // Convert name to space case
				required: g4ParameterObject.mandatory || false,         // Set required flag
				type: g4ParameterObject.type || 'String',               // Set type or default to 'String'
				value: g4ParameterObject.default || '',                 // Set default value or empty string
				optionsList: g4ParameterObject.values || []             // Set options or default to an empty array
			};

			// TODO: Consider to remove this condition
			if (bridgeObject.type.toUpperCase() === 'STRING' || bridgeObject.type.toUpperCase() === 'ANY') {
				bridgeObject.multiLine = false;
			}

			// Return the bridge object
			return bridgeObject;
		}

		// Initialize properties and parameters objects
		const properties = {};
		const parameters = {};

		// Process each property in manifest.properties
		if (manifest.properties) {
			for (const property of manifest.properties) {
				properties[property.name] = newBridgeObject(property);
			}
		}

		// Process each parameter in manifest.parameters
		if (manifest.parameters) {
			for (const parameter of manifest.parameters) {
				parameters[parameter.name] = newBridgeObject(parameter);
			}
		}

		// Check if the manifest has categories and determine if it is a condition or loop
		const categories = manifest.categories ? manifest.categories.join("|").toUpperCase() : "";
		let isCondition = categories.includes('CONDITION');
		let isLoop = categories.includes('LOOP');
		let isContainer = !isCondition && !isLoop && (categories.includes('CONTAINER') || manifest.properties.some(item => item.name.toUpperCase() === "RULES"));

		// Initialize the new G4 step object
		let step = {
			componentType: "task",
		};

		// Check if the manifest is a condition and initialize the branches object
		if (isCondition) {
			step.componentType = 'switch';
			step.type = 'if';
			step.branches = {
				true: [],
				false: []
			};
		}

		// Check if the manifest is a loop and initialize the sequence array
		if (isLoop) {
			step.componentType = 'container';
			step.type = 'loop';
			step.sequence = [];
		}

		// Check if the manifest is a loop and initialize the sequence array
		if (isContainer) {
			step.componentType = 'container';
			step.name = "Actions Group";
			step.type = 'container';
			step.sequence = [];
		}

		// Set the remaining properties of the new G4 step object
		step.categories = manifest.categories ? manifest.categories.join("|").toUpperCase() : "";
		step.description = manifest.summary ? manifest.summary.join('\n') : 'Description not provided.';
		step.id = uid();
		step.name = step.name === "Actions Group" ? step.name : convertPascalToSpaceCase(manifest.key);
		step.parameters = parameters;
		step.pluginName = manifest.key;
		step.aliases = manifest.aliases || [];
		step.pluginType = manifest.pluginType;
		step.properties = properties;

		// Return the new G4 step object
		return step;
	}
}

// Client for sending requests to the G4 API.
class G4Client {
	/**
	 * Creates an instance of G4Client.
	 * @param {string} baseUrl - The base URL for the G4 API.
	 */
	constructor(baseUrl = "http://localhost:9944/api/v4/g4") {
		// The base URL for the API.
		this.baseUrl = baseUrl;

		// The URL endpoint to invoke an automation sequence.
		this.invokeUrl = `${this.baseUrl}/automation/invoke`;

		// The URL endpoint to initialize an automation sequence.
		this.initializeUri = `${this.baseUrl}/automation/init`;

		// The URL endpoint to fetch plugin manifests.
		this.manifestsUrl = `${this.baseUrl}/integration/manifests`;

		// The URL endpoint for the cache (if needed for future use).
		this.cacheUrl = `${this.baseUrl}/integration/cache`;

		// An in-memory cache to store fetched manifests.
		this.manifests = [];
	}

	/**
	 * Converts a step object into a rule object for the G4 Automation Sequence.
	 *
	 * This function transforms a given `step` object, which contains plugin information,
	 * properties, and parameters, into a structured `rule` object suitable for use in
	 * the G4 Automation Sequence. It handles the conversion of property keys to camelCase
	 * and formats parameters as command-line arguments.
	 *
	 * @param {Object} step - The step object to convert.
	 * @param {string} step.pluginName - The name of the plugin.
	 * @param {Object} step.properties - An object containing properties for the plugin.
	 * @param {Object} step.parameters - An object containing parameters for the plugin.
	 * @returns {Object} - The converted rule object.
	 *
	 * @example
	 * const step = {
	 *   pluginName: 'SomePlugin',
	 *   properties: {
	 *     'Property One': { value: 'Value1' },
	 *     'Property Two': { value: 'Value2' },
	 *   },
	 *   parameters: {
	 *     'param1': { value: 'value1' },
	 *     'param2': { value: 'value2' },
	 *   }
	 * };
	 *
	 * const rule = convertToRule(step);
	 * console.log(rule);
	 * // Output:
	 * // {
	 * //   "$type": "Action",
	 * //   "pluginName": "SomePlugin",
	 * //   "propertyOne": "Value1",
	 * //   "propertyTwo": "Value2",
	 * //   "argument": "{{$ --param1:value1 --param2:value2}}"
	 * // }
	 */
	convertToRule(step) {
		/**
		 * Converts an array parameter into a formatted string of command-line arguments.
		 *
		 * @param {Object}        parameter         - The parameter object containing the name and value.
		 * @param {string}        parameter.name    - The name of the parameter.
		 * @param {Array<string>} [parameter.value] - An array of values for the parameter.
		 * @returns {string} - A string of formatted command-line arguments. Returns an empty string if the value array is empty.
		 *
		 * @example
		 * const param = { name: 'option', value: ['val1', 'val2'] };
		 * const result = convertFromArray(param);
		 * console.log(result); // "--option:val1 --option:val2"
		 */
		const convertFromArray = (parameter) => {
			// Initialize parameter.value to an empty array if it is undefined or null.
			parameter.value = parameter.value || [];

			// Return an empty string if the value array is empty.
			if (parameter.value.length === 0) {
				return "";
			}

			// Extract the name property from the parameter object.
			const name = parameter.name;

			// Map each item in the value array to a formatted string and join them with spaces.
			return parameter.value.map(item => {
				return `--${name}:${item}`;
			}).join(" ");
		}

		/**
		 * Converts a dictionary parameter into a formatted string of command-line arguments.
		 *
		 * @param {Object} parameter - The parameter object containing the name and value.
		 * @param {string} parameter.name - The name of the parameter.
		 * @param {Object} [parameter.value] - An object representing key-value pairs for the parameter.
		 * @returns {string} - A string of formatted command-line arguments. Returns an empty string if the value object is empty.
		 *
		 * @example
		 * const param = { name: 'config', value: { host: 'localhost', port: '8080' } };
		 * const result = convertFromDictionary(param);
		 * console.log(result); // "--config:host=localhost --config:port=8080"
		 */
		const convertFromDictionary = (parameter) => {
			// Initialize parameter.value to an empty object if it is undefined or null.
			parameter.value = parameter.value || {};

			// Extract the keys from the parameter value object.
			const keys = Object.keys(parameter.value);

			// Return an empty string if the value object has no keys.
			if (keys.length === 0) {
				return "";
			}

			// Extract the name property from the parameter object.
			const name = parameter.name;

			// Map each key-value pair to a formatted string and join them with spaces.
			return keys.map(key => {
				return `--${name}:${key}=${parameter.value[key]}`;
			}).join(" ");
		}

		// Initialize the rule object with the default type and plugin name.
		let rule = {
			"$type": "Action",
			"pluginName": step.pluginName
		};

		// Initialize an array to hold formatted parameter strings.
		let parameters = [];

		/**
		 * Iterate over each property in the step's properties object.
		 * Convert the property key to camelCase and assign its value to the rule object.
		 */
		for (const key in step.properties) {
			// Convert the property key from its original format to camelCase.
			const propertyKey = convertToCamelCase(key);

			// Assign the property's value to the rule object using the camelCase key.
			rule[propertyKey] = step.properties[key].value;
		}

		// Initialize the parameter token as an empty string.
		let parameterToken = '';

		/**
		 * Iterate over each parameter in the step's parameters object.
		 * Format each parameter as "--key:value" and add it to the parameters array.
		 */
		for (const key in step.parameters) {
			// Extract the parameter type from the step's parameters object.
			const parameterType = step.parameters[key].type.toUpperCase();

			// Check if the parameter has a value and is not an empty string.
			const value = step.parameters[key].value;
			const isArray = value && parameterType === 'ARRAY';
			const isDictionary = value && (parameterType === 'DICTIONARY' || parameterType === 'KEY/VALUE' || parameterType === 'OBJECT');
			const isBoolean = parameterType === 'SWITCH';
			const isValue = !isDictionary && !isArray && value && value.length > 0;

			// Construct the parameter token based on the parameter type and value.
			if (isBoolean && isValue) {
				parameterToken = `--${key}`;
			}
			else if (isValue) {
				parameterToken = `--${key}:${value}`;
			}
			else if (isArray) {
				parameterToken = convertFromArray(step.parameters[key]);
			}
			else if (isDictionary) {
				parameterToken = convertFromDictionary(step.parameters[key]);
			}
			else if (!parameterToken || parameterToken === "") {
				continue;
			}
			else {
				continue;
			}

			// Add the formatted parameter token to the parameters array.
			parameters.push(`${parameterToken}`);
		}

		/**
		 * If there are any parameters, concatenate them into a single string
		 * and assign it to the rule's "argument" field in the specified format.
		 */
		if (parameters.length > 0) {
			// The argument field uses a templating syntax with double curly braces.
			rule["argument"] = `{{$ ${parameters.join(" ")}}}`;
		}

		// Return the fully constructed rule object.
		return rule;
	}

	/**
	 * Fetches the G4 cache from the API.
	 *
	 * @async
	 * @returns {Promise<Object>} A promise that resolves to the cached data retrieved from the API.
	 * @throws {Error} Throws an error if the network request fails or the response is not OK.
	 */
	async getCache() {
		try {
			// Fetch the cache data from the API using the cacheUrl endpoint.
			const response = await fetch(this.cacheUrl);

			// Check if the response status indicates success (HTTP 200-299).
			if (!response.ok) {
				throw new Error(`Network response was not ok: ${response.statusText}`);
			}

			// Parse the JSON data from the response.
			const data = await response.json();

			// Return the parsed cache data.
			return data;
		} catch (error) {
			// Log the error to the console for debugging.
			console.error('Failed to fetch G4 cache:', error);

			// Rethrow the error to ensure the caller is aware of the failure.
			throw new Error(error);
		}
	}

	/**
	 * Retrieves and organizes plugin manifests into groups based on their categories and scopes.
	 *
	 * @async
	 * @returns {Promise<Object>} A promise that resolves to an object containing grouped manifests.
	 * Each group is keyed by category (and optionally scope) with its corresponding manifests.
	 */
	async getGroups() {
		// Function to convert PascalCase to space-separated words.
		const convertPascalToSpaceCase = (str) => str.replace(/([A-Z])/g, ' $1').trim();

		// Fetch the manifests using the existing method.
		const manifests = await this.getManifests();

		// Initialize an empty object to store the groups.
		const groups = {};

		// Iterate through each manifest in the manifests object.
		for (const manifest of Object.values(manifests)) {
			// Ensure the manifest has a 'scopes' array.
			manifest.scopes = manifest.scopes || [];

			// Determine if the manifest has a scope that includes 'ANY' (case-insensitive).
			const isAnyScope = manifest.scopes.some(scope => scope.toUpperCase() === 'ANY') || manifest.scopes.length === 0;

			// Retrieve the categories array or use an empty array if it's undefined.
			const categories = manifest.categories || [];

			// If the manifest has 'ANY' scope, add it to each of its categories.
			if (isAnyScope) {
				for (const category of categories) {
					// Convert the category name to a space-separated string.
					const categoryName = convertPascalToSpaceCase(category);

					// Ensure the group exists for this category.
					groups[categoryName] = groups[categoryName] || { name: categoryName, manifests: [] };

					// Add the manifest to the category's group.
					groups[categoryName].manifests.push(manifest);
				}

				// Skip processing other scopes since 'ANY' covers all.
				continue;
			}

			// If no 'ANY' scope, iterate through each category and scope.
			for (const category of categories) {
				for (const scope of manifest.scopes) {
					// Create a combined category name (e.g., "Category (Scope)").
					const categoryName = `${convertPascalToSpaceCase(category)} (${convertPascalToSpaceCase(scope)})`;

					// Ensure the group exists for this combined category and scope.
					groups[categoryName] = groups[categoryName] || { name: categoryName, manifests: [] };

					// Add the manifest to the combined group's manifests.
					groups[categoryName].manifests.push(manifest);
				}
			}
		}

		// Return the organized groups.
		return groups;
	}

	/**
	 * Fetches and returns G4 manifests of type 'Action'.
	 * Caches the manifests after the first fetch to avoid redundant network requests.
	 * 
	 * @returns {Promise<Object>} A promise that resolves to the manifests object.
	 * @throws Will throw an error if the network request fails.
	 */
	async getManifests() {
		// If manifests are already cached, return them directly.
		if (this.manifests.length > 0) {
			return this.manifests;
		}

		try {
			// Fetch the plugin manifests from the API.
			const response = await fetch(this.manifestsUrl);

			// Check if the response status is OK (HTTP 200-299).
			if (!response.ok) {
				throw new Error(`Network response was not ok: ${response.statusText}`);
			}

			// Parse the JSON response.
			const data = await response.json();

			// Filter only the plugins of type 'Action' and organize them into a dictionary by `key`.
			this.manifests = data
				.filter(item => item.pluginType === 'Action') // Include only 'Action' type plugins.
				.reduce((cache, manifest) => {
					// Use the `key` field of the manifest as the dictionary key.
					cache[manifest.key] = manifest;
					return cache;
				}, {});

			return this.manifests; // Return the cached manifests.
		} catch (error) {
			// Log the error for debugging and rethrow it.
			console.error('Failed to fetch G4 plugins:', error);
			throw new Error(error);
		}
	}

	/**
	 * Invokes the G4 Automation Sequence by sending a POST request with the provided definition.
	 *
	 * This asynchronous function sends a JSON payload to a predefined automation URL using the Fetch API.
	 * It handles the response by parsing the returned JSON data and managing errors that may occur during the request.
	 *
	 * @async
	 * @function invokeAutomation
	 * @param {Object} definition - The automation definition object to be sent in the POST request body.
	 * @returns {Promise<Object>} - A promise that resolves to the parsed JSON response data from the server.
	 * @throws {Error} - Throws an error if the network response is not ok or if the fetch operation fails.
	 */
	async invokeAutomation(definition) {
		try {
			// Invoke the G4 automation sequence by sending a POST request with the automation definition.
			const response = await fetch(this.invokeUrl, {
				method: 'POST', // HTTP method set to POST for sending data
				headers: {
					'Content-Type': 'application/json' // Indicates that the request body is in JSON format
				},
				body: JSON.stringify(definition) // Converts the definition object to a JSON string for the request body
			});

			// Check if the response status indicates a successful request (HTTP status code 200-299).
			if (!response.ok) {
				// If the response is not ok, throw an error with the status text for debugging purposes.
				throw new Error(`Network response was not ok: ${response.statusText}`);
			}

			// Parse the JSON data from the successful response.
			const data = await response.json();

			// Return the parsed data for further processing by the caller.
			return data;
		} catch (error) {
			// Log the error to the console for debugging and monitoring purposes.
			console.error('Failed to invoke G4 automation:', error);

			// Rethrow the original error to ensure that the caller can handle it appropriately.
			// Using 'throw error' preserves the original error stack and message.
			throw error;
		}
	}

	newAutomation(authentication, driverParameters) {
		driverParameters = driverParameters || {
			"driver": "MicrosoftEdgeDriver",
			"driverBinaries": "https://gravityapi1:pyhBifB6z1YxJv53xLip@hub-cloud.browserstack.com/wd/hub",
			"capabilities": {
				"alwaysMatch": {
					"browserName": "MicrosoftEdge"
				},
				"firstMatch": [
					{}
				]
			}
		};
		authentication = authentication || {
			username: "pyhBifB6z1YxJv53xLip"
		};

		return {
			authentication,
			driverParameters,
			stages: [
				{
					description: "Main Stage",
					jobs: [
						{
							description: "Main Stage",
							name: "Main Stage",
							rules: [
							]
						}
					],
					name: "Main Stage"
				}
			]
		};
	}
}
