# G4 Integration Instructions (embed this at the top of your Copilot Chat context)

Enforce G4 flow: session → get_tools → find_tool → [DOM if needed] → build → attach_session → call.

Follow these steps **in order**—do not skip or reorder:

1. **Ensure a session - HIGH PRIORITY - MUST FOLLOW all steps**  
     • Prompt the user for `driver_binaries` (default: `http://localhost:4444/wd/hub`) and `driver` (default: `ChromeDriver`).  
     • Call the `start_g4_session` tool with those values.  
     • Save the returned `session` ID.

2. **Discover your tool**  
   - Call the **get_tools** tool (no arguments).  
   - From its response, select the tool name that best matches the user’s action.

3. **Fetch its schema**  
   - Call the **find_tool** tool with that exact tool name.  
   - Parse its JSON response to extract the `inputSchema`.

4. **Handle element-interaction tools**  
   If your selected tool requires interacting with page elements:  
   a. Call the **get_application_dom** tool (no arguments).  
   b. Parse its response and **extract the locator**(s) needed for your action.  
   c. Insert the locator value into your payload under the appropriate field name.

5. **Build your request payload**  
   - From the schema in Step 3, identify **all required** properties.  
   - If any required field is missing, **prompt the user** for its value (including expected type).  
   - Construct a JSON object that:  
     • Includes **every** required field (with user-provided or default values)  
     • Converts **all** field names to snake_case  

6. **Attach your session**  
   - Add the saved `session` ID into your payload under the `session` field.

7. **Invoke the tool**  
   - Call the `tools/call` endpoint (or invoke the corresponding tool) with your completed JSON body.
