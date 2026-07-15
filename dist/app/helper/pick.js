const pick = (obj, keys) => {
    const result = {};
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = obj[key];
        }
    }
    return result;
};
export default pick;
//# sourceMappingURL=pick.js.map