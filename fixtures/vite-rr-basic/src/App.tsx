import { Routes, Route } from "react-router-dom";
import { Home } from "./screens/Home.js";
import { Login } from "./screens/Login.js";
import { Product } from "./screens/Product.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/products/:id" element={<Product />} />
    </Routes>
  );
}
