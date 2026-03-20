function transform(input) {
  var data = JSON.parse(input || "{}");
  var context = data.context || [
    "https://www.w3.org/2019/wot/td/v1",
    "https://www.w3.org/ns/ssn/",
    "https://www.w3.org/ns/sosa/",
    "https://example.org/contexts/iot-gateway.jsonld"
  ];

  function addForm(entry, href, op, contentType) {
    entry.forms = entry.forms || [];
    entry.forms.push({
      href: href,
      op: op,
      contentType: contentType || "application/json"
    });
  }

  function addProperty(td, prop) {
    td.properties = td.properties || {};
    var entry = {
      title: prop.title || prop.name,
      type: prop.type || "string",
      readOnly: !!prop.readOnly,
      observable: !!prop.observable
    };
    if (prop.unit) {
      entry.unit = prop.unit;
    }
    if (prop.description) {
      entry.description = prop.description;
    }
    if (prop.semanticTypes && prop.semanticTypes.length) {
      entry["@type"] = prop.semanticTypes;
    }
    addForm(entry, prop.href, prop.op || ["readproperty"], prop.contentType);
    td.properties[prop.name] = entry;
  }

  function addAction(td, action) {
    td.actions = td.actions || {};
    var entry = {
      title: action.title || action.name
    };
    if (action.description) {
      entry.description = action.description;
    }
    if (action.input) {
      entry.input = action.input;
    }
    if (action.semanticTypes && action.semanticTypes.length) {
      entry["@type"] = action.semanticTypes;
    }
    addForm(entry, action.href, action.op || ["invokeaction"], action.contentType);
    td.actions[action.name] = entry;
  }

  function addEvent(td, event) {
    td.events = td.events || {};
    var entry = {
      title: event.title || event.name
    };
    if (event.data) {
      entry.data = event.data;
    }
    if (event.description) {
      entry.description = event.description;
    }
    if (event.semanticTypes && event.semanticTypes.length) {
      entry["@type"] = event.semanticTypes;
    }
    addForm(entry, event.href, event.op || ["subscribeevent"], event.contentType);
    td.events[event.name] = entry;
  }

  var td = {
    "@context": context,
    id: data.thingId || "urn:openhab:thing:gateway",
    title: data.title || "OpenHAB Gateway",
    base: data.base || "http://localhost:8080",
    securityDefinitions: data.securityDefinitions || { nosec_sc: { scheme: "nosec" } },
    security: data.security || ["nosec_sc"]
  };

  (data.properties || []).forEach(function (prop) {
    addProperty(td, prop);
  });

  (data.actions || []).forEach(function (action) {
    addAction(td, action);
  });

  (data.events || []).forEach(function (event) {
    addEvent(td, event);
  });

  if (data.links && data.links.length) {
    td.links = data.links;
  }

  if (data.profile) {
    td.profile = data.profile;
  }

  if (data.types && data.types.length) {
    td["@type"] = data.types;
  }

  return JSON.stringify(td, null, 2);
}
