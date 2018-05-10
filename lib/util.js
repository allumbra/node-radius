var rad = require("./radius");
var _ = require("lodash");

const ATTR_ID = 0;
const ATTR_NAME = 1;
const ATTR_TYPE = 2;
const ATTR_ENUM = 3;
const ATTR_REVERSE_ENUM = 4;
const ATTR_MODIFIERS = 5;

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

const defaultAttrInfo = {type: "default", modifiers: {}, enum:{}};
var decodeValue = (val, attInf) => {
    attInf = attInf || defaultAttrInfo;
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
            if (attInf.modifiers["has_tag"]) {  
                var buf = new Buffer([0, 0, 0, 0]);
                val.copy(buf, 1);
                result = buf;
            }
            result = val.readUInt32BE(0);
            result = attInf.enum[result] || result;
            break;
        default:
            result = stringDecoder(val);
    }
    return result;
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

    var attrInfo = rad.lookup_attribute_info(type, vendorId);
    console.log(vendorId, type, attrInfo);
    var vsaName = (attrInfo && attrInfo[ATTR_NAME]) || ("DNF:" + vendorId + ":" + type);
    var result = {};
    result[vsaName] = decodeValue(value, {type: attrInfo[ATTR_TYPE], enum: attrInfo[ATTR_ENUM], modifiers: attrInfo[ATTR_MODIFIERS]});
    return result;
}
var decodeBufferMap = (map) => {
    var attInfoMap = rad.attribute_info_map(_.keys(map));
    var vsas = {};
    var decBuffMap =  _.reduce(map, (acc, val, code) => {
        var attInf = attInfoMap[code];
        if (!attInf) return acc;
        var result;
        if (code >= 262 && code <= 278){
        //     // Translate MS Radius codes that we care about
        //     // https://msdn.microsoft.com/en-us/library/bb892011(v=vs.85).aspx
        //     switch(code){  // TODO
        //         case 262: // Specifies the request type code.
        //         case 263: // Identifier
        //         case 264: // Authenticator. Specifies the request authenticator. 
        //         case 265: // SrcIPAddress
        //         case 266: // SrcPort
        //         case 271: // Unique ID
        //         default: 
        //             
        //     }
            return acc;  // noop
        }
        if (code == 26) {  // process VSA
            var vsa = decodeVsa(val);
            var key = _.keys(vsa)[0];
            vsas[key] = vsa[key];
        } else {
            result = decodeValue(val,attInf);
        }
        var key = attInfoMap[code]['name'] || code;
        acc[key] = result;
        return acc;
    },
        {});
    decBuffMap['Vendor-Specific'] = vsas;
    return decBuffMap;

}

var decodeNpsRadius = (obj) => {
    var result = {};
    result.code = rad.lookup_request_code(obj.requestCode);
    var bufferMap = base64MapToBuffer(obj.request);    
    result.attributes = decodeBufferMap(bufferMap);
    return result;
}

module.exports = {
    stringDecoder: stringDecoder,
    ipDecoder: ipDecoder,
    dateDecoder: dateDecoder,
    integerDecoder: integerDecoder,
    decodeBufferMap: decodeBufferMap,
    base64MapToBuffer: base64MapToBuffer,
    decodeNpsRadius: decodeNpsRadius,
}