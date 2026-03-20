function transform(input) {
  var data = JSON.parse(input || "{}");
  var directory = data.directory || [];
  var query = data.query || {};

  function matchValue(value, expected) {
    if (!expected) {
      return true;
    }
    if (!value) {
      return false;
    }
    var hay = String(value).toLowerCase();
    var needle = String(expected).toLowerCase();
    return hay.indexOf(needle) !== -1;
  }

  var filtered = directory.filter(function (entry) {
    var types = (entry.types || []).join(" ");
    var capabilities = (entry.capabilities || []).join(" ");
    return matchValue(types, query.type) &&
      matchValue(entry.location, query.location) &&
      matchValue(capabilities, query.capability);
  });

  return JSON.stringify(filtered, null, 2);
}
