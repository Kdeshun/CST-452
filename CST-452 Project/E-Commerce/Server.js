const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

// Import auth routes
const authRoutes = require('./routes/auth');

// Import Models  
const User = require('./models/User');
const Product = require('./models/Product');
const CartItem = require('./models/CartItem');
const Order = require('./models/Order');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// JWT Middleware for protecting routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access token required' 
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                message: 'Invalid or expired token' 
            });
        }
        req.user = user;
        next();
    });
};

// Auth routes
app.use('/api/auth', authRoutes);

// Products endpoint (public - no auth required)
app.get('/products', async (req, res) => {
    try {
        const products = await Product.find({});
        
        res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching products',
            error: error.message
        });
    }
});

// Cart Routes - All require authentication

// GET /cart - Get user's cart
app.get('/cart', authenticateToken, async (req, res) => {
    try {
        const cartItems = await CartItem.find({ userId: req.user.id })
            .populate('productId', 'name price description category')
            .sort({ createdAt: -1 });

        // Transform the data to match frontend expectations
        const cart = cartItems.map(item => ({
            id: item.productId._id,
            name: item.productId.name,
            price: item.productId.price,
            description: item.productId.description,
            category: item.productId.category,
            quantity: item.quantity
        }));

        res.status(200).json({
            success: true,
            count: cart.length,
            data: cart
        });
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching cart',
            error: error.message
        });
    }
});

// POST /cart/add - Add item to cart
app.post('/cart/add', authenticateToken, async (req, res) => {
    try {
        const { productId, quantity = 1 } = req.body;

        // Validate product exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if item already exists in cart
        const existingCartItem = await CartItem.findOne({
            userId: req.user.id,
            productId: productId
        });

        if (existingCartItem) {
            // Update quantity if item exists
            existingCartItem.quantity += quantity;
            await existingCartItem.save();

            res.status(200).json({
                success: true,
                message: 'Cart updated successfully',
                data: {
                    productName: product.name,
                    quantity: existingCartItem.quantity
                }
            });
        } else {
            // Create new cart item
            const cartItem = new CartItem({
                userId: req.user.id,
                productId: productId,
                quantity: quantity
            });

            await cartItem.save();

            res.status(201).json({
                success: true,
                message: 'Item added to cart successfully',
                data: {
                    productName: product.name,
                    quantity: quantity
                }
            });
        }
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding item to cart',
            error: error.message
        });
    }
});

// PUT /cart/update - Update item quantity
app.put('/cart/update', authenticateToken, async (req, res) => {
    try {
        const { productId, quantity } = req.body;

        if (quantity < 1) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be at least 1'
            });
        }

        const cartItem = await CartItem.findOne({
            userId: req.user.id,
            productId: productId
        });

        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }

        cartItem.quantity = quantity;
        await cartItem.save();

        // Get product name for response
        const product = await Product.findById(productId);

        res.status(200).json({
            success: true,
            message: 'Cart updated successfully',
            data: {
                productName: product.name,
                quantity: quantity
            }
        });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating cart',
            error: error.message
        });
    }
});

// DELETE /cart/remove - Remove item from cart
app.delete('/cart/remove', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.body;

        const cartItem = await CartItem.findOne({
            userId: req.user.id,
            productId: productId
        });

        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }

        // Get product name before deleting
        const product = await Product.findById(productId);
        
        await CartItem.deleteOne({
            userId: req.user.id,
            productId: productId
        });

        res.status(200).json({
            success: true,
            message: 'Item removed from cart successfully',
            data: {
                productName: product.name
            }
        });
    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing item from cart',
            error: error.message
        });
    }
});

// ORDER PROCESSING ROUTES - All require authentication
app.post('/orders', authenticateToken, async (req, res) => {
    try {
        const { shippingInfo } = req.body; 
        // Get user's cart items
        const cartItems = await CartItem.find({ userId: req.user.id })
            .populate('productId', 'name price description category');
        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }
        // Calculate order totals
        let subtotal = 0;
        const orderItems = cartItems.map(item => {
            const itemTotal = item.productId.price * item.quantity;
            subtotal += itemTotal;
           
            return {
                productId: item.productId._id,
                name: item.productId.name,
                price: item.productId.price,
                quantity: item.quantity,
                itemTotal: itemTotal
            };
        });
        const shipping = 5.99; //  shipping cost
        const taxRate = 0.08; // 8% tax rate
        const tax = subtotal * taxRate;
        const total = subtotal + shipping + tax;
     
         Generate orderId manually
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(10000 + Math.random() * 90000);
        const orderId = `ORD-${date}-${randomNum}`;
        console.log('Generated orderId:', orderId); // Debug log

        const newOrder = new Order({
            orderId: orderId, 
            userId: req.user.id,
            items: orderItems,
            shippingInfo: {
               
                city: shippingInfo.city,
                phone: shippingInfo.phone
            },
       
            orderSummary: {
                subtotal: parseFloat(subtotal.toFixed(2)),
                shipping: shipping,
                tax: parseFloat(tax.toFixed(2)),
                total: parseFloat(total.toFixed(2))
            }
        });
        await newOrder.save();
        // Clear user's cart after successful order
        await CartItem.deleteMany({ userId: req.user.id });
        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            orderId: newOrder.orderId,
            data: {
                orderId: newOrder.orderId,
                total: newOrder.orderSummary.total,
                itemCount: newOrder.items.length,
                orderDate: newOrder.orderDate
            }
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing order',
            error: error.message
        });
    }
});

// GET /orders - Get user's order history
app.get('/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id })
            .sort({ orderDate: -1 }) // Most recent first
            .select('orderId orderDate status orderSummary items');

        const orderHistory = orders.map(order => ({
            orderId: order.orderId,
            orderDate: order.orderDate,
            status: order.status,
            itemCount: order.items.length,
            total: order.orderSummary.total
        }));

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orderHistory
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching orders',
            error: error.message
        });
    }
});

// GET /orders/:orderId - Get specific order details
app.get('/orders/:orderId', authenticateToken, async (req, res) => {
    try {
        const order = await Order.findOne({
            orderId: req.params.orderId,
            userId: req.user.id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        res.status(200).json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching order details',
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));