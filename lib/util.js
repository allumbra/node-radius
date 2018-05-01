var rad = require("./radius");
var _ = require("lodash");

var stringDecoder = (value) => value.toString("utf8");
var ipDecoder = (value) => {
    var octets = [];
    for (var i = 0; i < value.length; i++) {
        octets.push(value[i]);
    }
    return octets.join(".");
}
var dateDecoder = (value) => new Date(value.readUInt32BE(0) * 1000);
// also used for time
var integerDecoder = (value, has_tag) => {
    if (has_tag) {
        var buf = new Buffer([0, 0, 0, 0]);
        value.copy(buf, 1);
        value = buf;
    }
    return value.readUInt32BE(0);
    // let's let the caller handle the below line if needed
    // value = attr_info[ATTR_ENUM][value] || value; //??
}

var base64MapToBuffer = (map) => _.reduce(map,
    (acc, value, key) => {
        acc[key] = Buffer.from(value, 'base64');
        return acc;
    },
    {});
var decodeVsa = (data) => {
    // if key is 26 then we have a VSA
    // 1) get vendor ID
    // 2) look up attribute from dictionary
    // 3) parse if lookup succeeded

    var vendorId = data.readUInt32BE(0);
    var type = data.readUInt8(4);  // type will be 26 for VSA's
    var length = data.readUInt8(5);
    var value = Buffer.from(_.drop(data, 6));
    
    
    // TODO: look up type in dictionary
    var attrInfo = rad.lookup_attribute_info(type, vendorId);
    console.log("=============================");
    console.log(vendorId, type, length, attrInfo, stringDecoder(value));

    // TODO: parse value

    // default to string


}
var decodeBufferMap = (map) => {
    var attInfoMap = rad.attribute_info_map(_.keys(map));
    return _.reduce(map, (acc, val, code) => {
        var attInf = attInfoMap[code];
        if (!attInf) return acc;
        var result;
        if (code == 26) {  // process VSA
            result = decodeVsa(val);
        } else {
            switch (attInf.type) {
                case "string":
                case "text":
                    // assumes utf8 encoding for strings
                    result = stringDecoder(val);
                    break;
                case "ipaddr":
                    result = ipDecoder(val);
                    break;
                case "date":
                    result = dateDecoder(val);
                    break;
                case "time":
                case "integer":
                    if (attInf.modifiers["has_tag"]) {  //FIXME attr_info not here
                        var buf = new Buffer([0, 0, 0, 0]);
                        val.copy(buf, 1);
                        result = buf;
                    }
                    result = val.readUInt32BE(0);
                    result = attInf.enum[result] || result;
                    break;
            }
        }
        acc[code] = result;
        return acc;
    },
        {});
}



module.exports = {
    stringDecoder: stringDecoder,
    ipDecoder: ipDecoder,
    dateDecoder: dateDecoder,
    integerDecoder: integerDecoder,
    decodeBufferMap: decodeBufferMap,
    base64MapToBuffer: base64MapToBuffer
}