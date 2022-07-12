// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// Contract for the Kami Token.
// This token has a cap.
// This token is mintable, burnable and pausable.
// The ownership of this contract call also be transfered.
contract KamiToken is
    ERC20("Kami", "KAMI"),
    ERC20Burnable,
    ERC20Pausable,
    Initializable,
    Ownable
{
    uint256 public cap;
    function initialize(uint256 _cap) public onlyOwner initializer {
        cap = _cap;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        super._beforeTokenTransfer(from, to, amount);
    }

    function mint(uint256 _amount) public onlyOwner {
        require(
            totalSupply() + _amount <= cap,
            "Mint exceeds maximum cap"
        );
        _mint(msg.sender, _amount);
    }

    function updateCap(uint256 _cap) public onlyOwner {
        require(
            _cap >= totalSupply(),
            "New cap is lower than total supply"
        );
        cap = _cap;
    }
}
