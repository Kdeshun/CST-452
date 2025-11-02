const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        itemTotal: {
            type: Number,
            required: true,
            min: 0
        }
    }],
    shippingInfo: {
        
        city: {
            type: String,
            required: true,
            trim: true
        },
        phone: {
            type: String,
            required: true,
            trim: true
        },
        //  Keep these for backward compatibility 
        fullName: {
            type: String,
            trim: true
        },
        address: {
            type: String,
            trim: true
        },
        state: {
            type: String,
            trim: true
        },
        zipCode: {
            type: String,
            trim: true
        }
    },

    paymentInfo: {
        method: {
            type: String,
            enum: ['credit_card', 'debit_card', 'paypal', 'credit-card', 'apple-pay'], 
            default: null 
        },
       
        cardLast4: {
            type: String
        },
        cardType: {
            type: String,
            enum: ['visa', 'mastercard', 'american_express', 'discover']
        }
    },
    orderSummary: {
        subtotal: {
            type: Number,
            required: true,
            min: 0
        },
        shipping: {
            type: Number,
            required: true,
            min: 0,
            default: 5.99
        },
        tax: {
            type: Number,
            required: true,
            min: 0
        },
        total: {
            type: Number,
            required: true,
            min: 0
        }
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    orderDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

//  Generate unique order ID before saving
orderSchema.pre('save', function(next) {
    // Only generate if orderId doesn't exist
    if (this.isNew && !this.orderId) {
      
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(10000 + Math.random() * 90000);
        this.orderId = `ORD-${date}-${randomNum}`;
        console.log('Generated orderId:', this.orderId); 
    }
    next();
});


orderSchema.index({ userId: 1, orderDate: -1 });
orderSchema.index({ orderId: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;