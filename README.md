# <a id="gettingstarted"></a>ZainCash Integration Guide

This guide contains in details how to integrate Zain Cash online payment service in your website

## <a id="register"></a>Register a wallet

To integrate your site/application with ZainCash to start getting paid online, you first have to register a wallet, choosing from one of these wallets:

*   Special Wallet: for small business and startups, with maximum of 100m worth of trancstion per months with no daily limit.
*   Corporate Wallet: for large businesses, the maximum monthly worth of transaction depend on the size of your company.
*   Goverment Wallet: for goverment entities.

Your website have to be submited first to ZainCash to see if it is aligned with ZainCash’s security guideline.

After you finish registering a wallet, you’ll be sent an email with the following details:

*   1\. Test Merchant Phone Number and Pin.
*   2\. Test Customer Pheon Number and Pin.
*   3\. Private Key to generate JSON Web Tokens based on it.

After you finish integrate ZainCash checkout button on your website on a testing platform, we will provide you with the production credentails.

## <a id="generate"></a>Generate a transaction id

The first step is to issue a transactin id that you’ll be using in future steps.

Based on the **privatekey** that we sent to you through email, you generate a token with a payload of **amount** to be transfered and **msisdn** that represent the merchant phonenumber with the format **96478xxxxxxxx** or **96479xxxxxxxx**

Then you send a post request to **[https://api.zaincash.iq/generateuniqueid](https://api.zaincash.iq/generateuniqueid)** with the token and **service type** which represnet the service that this request is coming from and again with the msisdn.

For security reasons the transaction Id will be valid only for one hour.

![](public/styles/images/step1.png)

## <a id="popup"></a>Post to popup window

Place the checkout button on your website and with the below style

insert the following code to probely view your button

```

<button class="zaincash-btn" >
  <img  style="vertical-align:middle" src="path/to/zaincash-ar.png">
</button>

```

and some CSS

```

.zaincash-btn {
    background: #191817; /* Old browsers */
    border-radius:30px;
    border: none;
    outline: none;
    padding-right: 15px;
    padding-left: 15px;
    padding-top: 7px;
    padding-bottom: 7px;
}

.zaincash-btn:hover{
    background: #333231;
    transition: all 0.2s;
    color: #fff;
    border-radius:30px;
    border: none;
    outline: none;
}

.zaincash-btn > img {
    width: 160px;
}

```

the code below

```

function postToPopupWindow(params) {
  var form = document.createElement("form");
  form.setAttribute("method", "post");
  form.setAttribute("action", "https://api.zaincash.iq/pay");
  form.setAttribute("target", "NewFile");
  for (var i in params) {
    if (params.hasOwnProperty(i)) {
      var input = document.createElement('input');
        input.type = 'hidden';
        input.name = i;
        input.value = params[i];
        form.appendChild(input);
    }
  }

  document.body.appendChild(form);

  window.open("post.htm", "NewFile", "width=1000, height=600, modal=yes, left=100, top=100, resizable=yes, scrollbars=yes");
  form.submit();
  document.body.removeChild(form);
}

$("button").click(function(evt) {
  postToPopupWindow({
    id: '',
    lang: 'en'
  })
})

```

When a user clicks on the checkout button on your website, a popup window will be shown with a post request with the id returned from Step 1 and the language of interface to **[https://api.zaincash.iq/pay](https://api.zaincash.iq/pay)**

The user will be prompt to enter his credentials.

It’s up to you to post the data to a popup or a an iframe inside a modal.

![](public/styles/images/payment_portal.png)

## <a id="inform"></a>Informing of the completion of operation

When the user successfully enters his credentials the window will be closed, and postMessage method will be invoked to inform your tab that the operation ended with the message ‘done’.

![](public/styles/images/success.png)

you can listen to those messages using the following code:

```

window.addEventListener('message',function(event) {
  if(event.origin !== 'https://api.zaincash.iq') return;
  console.log('received response:  ',event.data);
},false);

```

## <a id="check"></a>Check the status of the transaction

This step is crucial to you to make sure that the transaction associated with the provided id is issued successfully. the request should contain the transactoin id, if the transaction id is created longer than 1 hour you’ll not be able to check the status of it.

![](public/styles/images/step4.png)
