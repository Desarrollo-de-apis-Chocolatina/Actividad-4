// Tienda de Abarrotes "Don Chico"

const express = require('express');
const app = express();

app.use(express.json());

let productos = [];
let ventas = [];
let siguienteIdProducto = 1;
let siguienteIdVenta = 1;

const METODOS_PAGO_VALIDOS = ['efectivo', 'tarjeta', 'transferencia'];

const normalizar = (texto) => String(texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

app.get('/productos', (req, res) => {
    const { q, nombre, categoria, stockBajo, stockMinimo, minStock } = req.query;
    const umbralParam = stockMinimo ?? minStock;

    let resultados = productos.slice();

    if (q) resultados = resultados.filter(p =>
        normalizar(p.nombre).includes(normalizar(q)) ||
        normalizar(p.categoria).includes(normalizar(q))
    );

    if (nombre) resultados = resultados.filter(p => normalizar(p.nombre).includes(normalizar(nombre)));
    if (categoria) resultados = resultados.filter(p => normalizar(p.categoria).includes(normalizar(categoria)));

    if (stockBajo === 'true' || umbralParam !== undefined) {
        const umbral = Number.isInteger(+umbralParam) ? +umbralParam : 5;
        resultados = resultados.filter(p => +p.stock < umbral);
    }

    res.json(resultados);
});

app.get('/productos/:id', (req, res) => {
    const producto = productos.find(p => p.id === +req.params.id);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(producto);
});

app.post('/productos', (req, res) => {
    const { nombre, categoria, precioUnitario, stock = 0, unidadMedida = '', fechaVencimiento = null, proveedor = '' } = req.body;

    if (!nombre || precioUnitario == null) return res.status(400).json({ error: 'Faltan campos obligatorios' });
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'El stock debe ser un entero y no puede ser negativo' });
    if (precioUnitario < 0) return res.status(400).json({ error: 'El precio unitario tiene que ser un numero mayor a 0' });

    const producto = {
        id: siguienteIdProducto++,
        nombre,
        categoria: categoria || '',
        precioUnitario: +precioUnitario,
        stock: +stock,
        unidadMedida,
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
        proveedor
    };

    productos.push(producto);
    res.status(201).json(producto);
});

app.put('/productos/:id', (req, res) => {
    const id = +req.params.id;
    const indice = productos.findIndex(p => p.id === id);

    if (indice === -1) return res.status(404).json({ error: 'Producto no encontrado' });
    if (req.body.stock !== undefined && (!Number.isInteger(req.body.stock) || req.body.stock < 0))
        return res.status(400).json({ error: 'El stock no puede ser negativo' });

    const actualizado = { ...productos[indice], ...req.body, id };
    if (actualizado.stock !== undefined) actualizado.stock = +actualizado.stock;
    if (actualizado.fechaVencimiento) actualizado.fechaVencimiento = new Date(actualizado.fechaVencimiento);

    productos[indice] = actualizado;
    res.json(actualizado);
});

app.delete('/productos/:id', (req, res) => {
    const indice = productos.findIndex(p => p.id === +req.params.id);
    if (indice === -1) return res.status(404).json({ error: 'Producto no encontrado' });
    const [eliminado] = productos.splice(indice, 1);
    res.json(eliminado);
});

app.get('/ventas', (req, res) => res.json(ventas));

app.get('/ventas/hoy', (req, res) => {
    const hoy = new Date();
    const ventasHoy = ventas.filter(v => {
        const fh = new Date(v.fechaHora);
        return fh.getFullYear() === hoy.getFullYear() &&
               fh.getMonth() === hoy.getMonth() &&
               fh.getDate() === hoy.getDate();
    });
    res.json(ventasHoy);
});

app.get('/ventas/:id', (req, res) => {
    const venta = ventas.find(v => v.id === +req.params.id);
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(venta);
});

app.post('/ventas', (req, res) => {
    const { productos: articulosVenta, metodoPago = 'efectivo' } = req.body;

    if (!Array.isArray(articulosVenta) || articulosVenta.length === 0)
        return res.status(400).json({ error: 'Lista de productos vacía' });

    if (!METODOS_PAGO_VALIDOS.includes(metodoPago.toLowerCase()))
        return res.status(400).json({ error: 'Método de pago inválido. Use: efectivo, tarjeta o transferencia' });

    let total = 0;
    const detalle = [];

    for (const articulo of articulosVenta) {
        const idProducto = +articulo.id;
        const cantidad = +articulo.cantidad;

        if (!Number.isInteger(idProducto) || idProducto <= 0)
            return res.status(400).json({ error: 'El id del producto no es válido' });
        if (!Number.isInteger(cantidad) || cantidad <= 0)
            return res.status(400).json({ error: 'La cantidad debe ser un entero mayor que 0' });

        const producto = productos.find(p => p.id === idProducto);
        if (!producto) return res.status(400).json({ error: `Producto ${idProducto} no existe` });
        if (producto.stock < cantidad) return res.status(400).json({ error: `Stock insuficiente para producto ${producto.nombre}` });

        total += producto.precioUnitario * cantidad;
        detalle.push(
            { 
                productoId: idProducto, 
                nombre: producto.nombre, 
                cantidad, 
                precioVenta: producto.
                precioUnitario 
            }
        );
    }

    for (const d of detalle) {
        productos.find(p => p.id === d.productoId).stock -= d.cantidad;
    }

    const venta = { 
        id: siguienteIdVenta++, 
        fechaHora: new Date(), 
        productos: detalle, 
        total, 
        metodoPago: metodoPago.toLowerCase() 
    };
    ventas.push(venta);
    res.status(201).json(venta);
});

app.listen(3000, 
    () => console.log('Servidor escuchando en http://localhost:3000')
);