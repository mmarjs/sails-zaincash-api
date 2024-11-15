var optSent = 0;
var actionClicked = false;
$("#phonenumber").keyup(function () {
  if (validatePhoneNumber($(this).val()))
    $('#phonestatus').html(" ");
  else
    $('#phonestatus').html(validation_phonestatus);
});
$("#sms-phone-number").keyup(function () {
  if (validatePhoneNumber($(this).val()))
    $('#smsphonestatus').html(" ");
  else
    $('#smsphonestatus').html(validation_phonestatus);
});

$("#phonenumber").keydown(function (e) {
  var key = e.keyCode ? e.keyCode : e.which;
  if (!([8, 9, 13, 27, 46, 110, 190].indexOf(key) !== -1 ||
      (key == 65 && (e.ctrlKey || e.metaKey)) ||
      (key >= 35 && key <= 40) ||
      (key >= 48 && key <= 57 && !(e.shiftKey || e.altKey)) ||
      (key >= 96 && key <= 105)
    )) {
    e.preventDefault();
  }
});

$('#payment-form').submit(function (evt) {
  //prevent default event
  evt.preventDefault();
  var phoneNumber =  $('#phonenumber').val();
  if (phoneNumber.startsWith("78") || phoneNumber.startsWith("79")){
    phoneNumber="964"+phoneNumber;
  }else if (phoneNumber.startsWith("078") || phoneNumber.startsWith("079")){
    phoneNumber = "964"+phoneNumber.substr(1);
  }
  $('#phonenumber').val(phoneNumber);
  //if opt sent submit the form
  if (optSent === 1) {
    return submitStep2();
  }
  submitStep1();
})

$( "#accordion" ).accordion({
        collapsible: true,
        active: false,
        icons: false,
        heightStyle: "content"
    });
if (!payByReference){
  $( "#accordion" ).accordion( "option", "active", 0);
}
// .on('click', function() {
//         $accordions.not(this).accordion('activate', false);
//     });;

function submitStep1() {

  if (!actionClicked){
    if ($('#phonenumber').val() == ''
       || isNaN($('#phonenumber').val()) || !validatePhoneNumber($('#phonenumber').val())) {
      $("body").snackbar({alive: 3000, content: validation_phonenumber});
    }
    else if ($('#pin').val() == '' || isNaN($('#pin').val()) || $('#pin').val().length < 4) {
      $("body").snackbar({
        alive: 3000,
        content: validation_phonenumberpin
      });
    } /*else if (!grecaptcha.getResponse()) {
      $("body").snackbar({
        alive: 3000,
        content: validation_captcha
      });
    }*/
    else {
      // Fire off the request to /form.php
      actionClicked = true;
      request = $.ajax({
        url: "/transaction/processing",
        type: "post",
        data: {
          //"g_recaptcha_response": grecaptcha.getResponse(),
          "id": $('#id').val(),
          "phonenumber": $('#phonenumber').val(),
          "pin": $('#pin').val()
        }
      });

      // Callback handler that will be called on success
      request.done(function (response, textStatus, jqXHR) {
        // Log a message to the console
        actionClicked = false;
        //$("#captcha").hide();
        if (response.success == 1) {
          optSent = 1;
          //var onMerchant = response.onMerchantFees
          var onCustomer = response.onCustomerFees
          $("#discount").hide();
          if(onCustomer == 0 || !onCustomer || onCustomer == "0"){
            $("#fees_tr").hide();
            $("#total_tr").hide();
            $("#AmountWithoutCharge").show();
            $("#AmountWithCharge").hide();
          }else{
            $("#AmountWithCharge").show();
            $("#AmountWithoutCharge").hide();
            $("#AmountWithCharge").html($("#AmountWithCharge").html().replace(response.initialAmount,response.total))
          }

          $("#step1").hide();
          //$("#captcha").hide();
          $("#step2").show();
          $("#totalFees").html(response.totalFees)
          if (response.discount>0)
          {
            $("#discount").show();
           $("#discount").html($("#discount").html().replace('XXX',response.total-response.discount-response.totalFees));
          }
          $("#total").html(response.total)
          $(".snackbar div").remove();
          $("#otp").focus();
        }
        else {
          if (response.url) {
            window.location = response.url;
          }
          else {
            $("#step1").hide();
            $("#step1").remove();
            $("#stepsButtons").hide();
            $("#stepsErrors").show();
            $("#stepsErrors h3").html(response.error);
            $("#accordion").hide();
            $(".snackbar div").remove();
            pushMessage("failure", response.error);
          }
        }
      });

      // Callback handler that will be called on failure
      request.fail(function (jqXHR, textStatus, errorThrown) {
        actionClicked = false;
        $("#step1").hide();
        //$("#captcha").hide();
        $("#step1").remove();
        $("#stepsButtons").hide();
        $("#stepsErrors").show();
        if (typeof jqXHR.responseJSON!="undefined")
          $("#stepsErrors h3").html(jqXHR.responseJSON.error);
        $("#accordion").hide();
        $(".snackbar div").remove();
        if (typeof jqXHR.responseJSON!="undefined")
          pushMessage("failure", jqXHR.responseJSON.error);
      });

      $("body").snackbar({alive: 100000, content: validation_wait});
    }
  }
}
function submitStep2() {
  
  if (!actionClicked){
    var otp = $('#otp').val();
    if (otp == '' || isNaN(otp) || otp.length!=4) {
      $("body").snackbar({alive: 3000, content: validation_otp});
    }
    else {
      actionClicked = true;
      $('#payment-form')[0].submit();
      $("body").snackbar({alive: 100000, content: validation_wait});
    }
  }

  return false;
}

function pushMessage(message, details) {

  var mobileMsg = message
  if (details !== undefined) {
    mobileMsg = mobileMsg + "/++" + details
  } else {
    details = ""
  }

  if (window.android) {
    window.android.callback(mobileMsg)
  } else if (iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
    document.location.href = 'zaincash://' + mobileMsg
  } else {
    parent.opener.postMessage({status: message, details: details}, "*");
  }
}

function closePopup() {
  pushMessage("failure", "back_to_the_site");
  window.close()
}


var pattern = Trianglify({
  width: $('.content-header').width(),
  height: $('.content-header').height(),
  palette: Trianglify.colorbrewer,
  x_colors: 'Blues',
});
$('.content-header').html(pattern.canvas())
$(window).resize(function () {
  var pattern = Trianglify({
    width: $('.content-header').width(),
    height: $('.content-header').height(),
    palette: Trianglify.colorbrewer,
    x_colors: 'Blues',
  });
  $('.content-header').html(pattern.canvas())
});

 function printRefId(){
  var mywindow = window.open('', 'PRINT', 'height=400,width=600');

    mywindow.document.write('<html><head><title>Print Reference ID</title>');
    mywindow.document.write('</head><body >');
    mywindow.document.write('<div style="margin-top:50px;text-align:center">'+document.getElementById("qr-container").innerHTML+'</div>');
    mywindow.document.write('<div style="text-align:center;font-weight:bold;font-size:18px;">'+document.getElementById("reference-number").value+'</div>');
    mywindow.document.write('</body></html>');

    mywindow.document.close(); // necessary for IE >= 10
    mywindow.focus(); // necessary for IE >= 10*/

    setTimeout(function() {
        mywindow.print();
        mywindow.close();
    }, 1000);
    

    return true;
 }

 function validatePhoneNumber(phone){
  var regex=/^[0-9]+$/;
    if (!phone.match(regex))
    {
        return false;
    }

    if (!phone.startsWith("96478") && !phone.startsWith("96479") 
      && !phone.startsWith("078") && !phone.startsWith("079")
      && !phone.startsWith("78") && !phone.startsWith("79")){
      return false;
    }

    return true;
 }


function sendSMS(){
  if (!actionClicked){
    var phoneNumber =  $('#sms-phone-number').val();
      if (phoneNumber.startsWith("78") || phoneNumber.startsWith("79")){
        phoneNumber="964"+phoneNumber;
      }else if (phoneNumber.startsWith("078") || phoneNumber.startsWith("079")){
        phoneNumber = "964"+phoneNumber.substr(1);
      }

      $('#sms-phone-number').val(phoneNumber);
    if ($('#sms-phone-number').val() == '') {
      $("body").snackbar({alive: 3000, content: validation_phonenumber});
      return;
    }

    if (!validatePhoneNumber($('#sms-phone-number').val())) {
      $("body").snackbar({alive: 3000, content: validation_phonenumber});
      return;
    }
    $("body").snackbar({alive: 100000, content: validation_wait});
    actionClicked = true;
    $.ajax({
      url: "/transaction/sendSMS",
      success: function(result){
        actionClicked = false;
        if (!result.success){
          console.log(result.msg);
          $("body").snackbar({alive: 3000, content: sending_sms_error});
        }else{
          $("body").snackbar({alive: 3000, content: sms_sent_successfully});
        }
      },
      error:function(){
        actionClicked = false;
      },
      data:{
        phonenumber:$("#sms-phone-number").val(),
        reference_number:$("#reference-number").val()
      },
      type: "POST"
    });
  }
  
}

function ValidateEmail(mail)   
{  
 if (/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(mail))  
  {  
    return (true)  
  }  
    return (false)  
}

function sendEmail(){
  if (!actionClicked){
    if ($('#email').val() == '') {
      $("body").snackbar({alive: 3000, content: email_validation});
      return;
    }

    if (!ValidateEmail($('#email').val())){
      $("body").snackbar({alive: 3000, content: email_validation});
      return;
    }
    $("body").snackbar({alive: 100000, content: validation_wait});
    actionClicked = true;
    $.ajax({
      url: "/transaction/sendEmail",
      success: function(result){
        actionClicked = false
        if (!result.success){
          $("body").snackbar({alive: 3000, content: result.msg});
        }else{
          $("body").snackbar({alive: 3000, content: email_sent_successfully});
        }
      },
      error:function(){
        actionClicked = false;
      },
      data:{
        email:$("#email").val(),
        reference_number:$("#reference-number").val()
      },
      type: "POST"
    });
  }
  
}
var currentPosition={lat:33.3128,lng:44.3615}; //baghdad default location
var map;
var prev_infowindow =false; 
var bounds;

function initMap() {
  if (!document.getElementById('map'))
    return;
  map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: 33.3128, lng: 44.3615},
    zoom: 6
  });
  bounds = new google.maps.LatLngBounds();

  // Try HTML5 geolocation.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(showPosition,showError);
  } else {
    console.log("geolocation not supported!");
    map.setCenter(currentPosition);
    var myLatLng = new google.maps.LatLng(currentPosition.lat, currentPosition.lng);
    var userMarker = new google.maps.Marker({
        position: myLatLng,
        map: map,
        icon: '/images/bluecircle.png'
    });
    bounds.extend(userMarker.getPosition());
    getNearestAgent();
  }
}

function showPosition(position) {
    currentPosition.lat = position.coords.latitude;
    currentPosition.lng = position.coords.longitude;
    map.setCenter(currentPosition);
    var myLatLng = new google.maps.LatLng(currentPosition.lat, currentPosition.lng);
    var userMarker = new google.maps.Marker({
      position: myLatLng,
      map: map,
      icon: '/images/bluecircle.png'
  });
  bounds.extend(userMarker.getPosition());
    console.log("Latitude: " + position.coords.latitude + 
    "<br>Longitude: " + position.coords.longitude);
    getNearestAgent();
}

function showError(error) {
    var errorMessage = "";
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMessage = "User denied the request for Geolocation."
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable."
            break;
        case error.TIMEOUT:
            errorMessage = "The request to get user location timed out."
            break;
        case error.UNKNOWN_ERROR:
            errorMessage = "An unknown error occurred."
            break;
    }

    console.log("error geolocation ",errorMessage);
    map.setCenter(currentPosition);
    var myLatLng = new google.maps.LatLng(currentPosition.lat, currentPosition.lng);
    var userMarker = new google.maps.Marker({
        position: myLatLng,
        map: map,
        icon: '/images/bluecircle.png'
    });
    bounds.extend(userMarker.getPosition());
    getNearestAgent();
}



function getNearestAgent(){
  jQuery.ajax({
    url: "/transaction/getNearestAgents",
    success: function(result){
      console.log(result);
      
      for (var i=0;i<result.data.response.agents.length;i++){
        var agentMarker = new google.maps.Marker({
            position: new google.maps.LatLng(result.data.response.agents[i].latitude,result.data.response.agents[i].longitude),
            map: map
        });

        bounds.extend(agentMarker.getPosition());

        var content = "<div>\
                        <div style='padding:0px 15px;'>\
                          <strong>"+agent_name+": </strong>"
                          +result.data.response.agents[i].name
                      +"</div>\
                        <div style='padding:0px 15px;'>\
                          <strong>"+address+": </strong>"+
                          result.data.response.agents[i].address
                            +" - "+
                            result.data.response.agents[i].subregion.name
                            +"  "+result.data.response.agents[i].region.name+
                        "</div>\
                        <div style='padding:0px 15px;'>\
                          <strong>"+phone+": </strong>"+
                          result.data.response.agents[i].phone +
                      "</div>\
                        <div style='padding:0px 15px;'>\
                          <strong>"+code+": </strong>"+
                          result.data.response.agents[i].code+
                      "</div>\
                    </div>";     

        var infowindow = new google.maps.InfoWindow({ maxWidth: 320 })

        google.maps.event.addListener(agentMarker,'click', (function(agentMarker,content,infowindow){ 
          return function() {
          if( prev_infowindow ) {
             prev_infowindow.close();
          }
            prev_infowindow = infowindow;
            infowindow.setOptions({
                content: content,
                maxWidth:300
            });
             infowindow.open(map,agentMarker);
          };
      })(agentMarker,content,infowindow));
      }

      map.setCenter(bounds.getCenter());

      map.fitBounds(bounds);


      // set a minimum zoom 
      // if you got only 1 marker or all markers are on the same address map will be zoomed too much.
      if(map.getZoom()> 15){
        map.setZoom(15);
      }
    },
    data:{
      lat:currentPosition.lat,
      lng:currentPosition.lng,
      lang:language
    },
    type: "POST"
  });
}

function reloadMap(){
  setTimeout(function(){
    google.maps.event.trigger(map, 'resize');
    map.setCenter(bounds.getCenter());

    map.fitBounds(bounds);

  },1000);
}