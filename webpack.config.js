const path = require("path");

module.exports = {
  entry: {
    main: "./src/index.js",    // Reconhecimento facial
    popup: "./popup.js",       // Agora está na raiz, não mais em src
  },
  output: {
    filename: "[name].bundle.js", 
    path: path.resolve(__dirname), // gera direto na raiz do projeto
  },
  mode: "production",
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
    ],
  },
};
