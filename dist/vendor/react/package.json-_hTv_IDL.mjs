const e = "react", s = "React is a JavaScript library for building user interfaces.", t = ["react"], n = "18.3.1", o = "https://reactjs.org/", c = "https://github.com/facebook/react/issues", r = "MIT", a = ["LICENSE", "README.md", "index.js", "cjs/", "umd/", "jsx-runtime.js", "jsx-dev-runtime.js", "react.shared-subset.js"], i = "index.js", d = { ".": { "react-server": "./react.shared-subset.js", default: "./index.js" }, "./package.json": "./package.json", "./jsx-runtime": "./jsx-runtime.js", "./jsx-dev-runtime": "./jsx-dev-runtime.js" }, j = { type: "git", url: "https://github.com/facebook/react.git", directory: "packages/react" }, u = { node: ">=0.10.0" }, p = { "loose-envify": "^1.1.0" }, m = { transform: ["loose-envify"] }, g = {
  name: e,
  description: s,
  keywords: t,
  version: n,
  homepage: o,
  bugs: c,
  license: r,
  files: a,
  main: i,
  exports: d,
  repository: j,
  engines: u,
  dependencies: p,
  browserify: m
};
export {
  m as browserify,
  c as bugs,
  g as default,
  p as dependencies,
  s as description,
  u as engines,
  d as exports,
  a as files,
  o as homepage,
  t as keywords,
  r as license,
  i as main,
  e as name,
  j as repository,
  n as version
};
