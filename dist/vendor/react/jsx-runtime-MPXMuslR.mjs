import l from "react";
var f = {};
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var p = l, i = Symbol.for("react.element"), a = Symbol.for("react.fragment"), m = Object.prototype.hasOwnProperty, y = p.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, v = { key: !0, ref: !0, __self: !0, __source: !0 };
function s(t, r, _) {
  var e, o = {}, n = null, u = null;
  _ !== void 0 && (n = "" + _), r.key !== void 0 && (n = "" + r.key), r.ref !== void 0 && (u = r.ref);
  for (e in r) m.call(r, e) && !v.hasOwnProperty(e) && (o[e] = r[e]);
  if (t && t.defaultProps) for (e in r = t.defaultProps, r) o[e] === void 0 && (o[e] = r[e]);
  return { $$typeof: i, type: t, key: n, ref: u, props: o, _owner: y.current };
}
var O = f.Fragment = a, c = f.jsx = s, x = f.jsxs = s;
export {
  O as Fragment,
  f as default,
  c as jsx,
  x as jsxs
};
